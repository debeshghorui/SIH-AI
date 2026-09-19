import express from "express";
import pino from "pino";
import { z } from "zod";
import { snapshot } from "./airgap/log";
import { loadRegistry } from "./models/registry";
import { ollamaHealth } from "./models/health";
import { runAgent } from "./agent/loop";
import { runInspect } from "./agent/inspect";
import { pipeEvents } from "./agent/sse";
import { migrate } from "./retrieve/db";
import { withPersistedDone } from "./chat/persist";
import {
  ConversationNotFoundError,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  setPinned,
  setTitle,
  TITLE_MAX,
} from "./chat/sessions";
import { vaultList, resolveVaultPath, vaultWrite, vaultDelete } from "./tools/fs";
import { removeVaultIndex } from "./retrieve/vault-index";
import {
  isPreviewLanguage,
  normalizeLanguage,
  reapOrphanSandboxes,
  runHtmlPreview,
  runSandbox,
  sandboxHealth,
  sandboxInputSchema,
  shutdownSandbox,
  stopPreview,
  UnsupportedLanguageError,
} from "./tools/sandbox";

const log = pino({ name: "api" });

export const LISTEN_HOST = "127.0.0.1";
export const LISTEN_PORT = 8787;

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  hasAttachment: z.boolean().default(false),
  attachmentName: z.string().min(1).optional(),
  preferModel: z.enum(["nano", "chat", "coder"]).optional(),
  conversationId: z.string().uuid().optional(),
});

const patchConversationSchema = z
  .object({
    pinned: z.boolean().optional(),
    title: z.string().min(1).max(TITLE_MAX).optional(),
  })
  .refine((d) => d.pinned !== undefined || d.title !== undefined, {
    message: "empty patch",
  });

function artifactParam(name: string | string[] | undefined): string {
  const raw = Array.isArray(name) ? name.join("/") : (name ?? "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  // Raw upload must be registered before express.json() so the JSON parser
  // does not consume the request body stream first.
  app.post("/upload", express.raw({ type: "*/*", limit: "20mb" }), (req, res) => {
    const name = req.query.name;
    if (typeof name !== "string" || !name) {
      res.status(400).json({ error: "missing ?name=" });
      return;
    }
    try {
      const bytes = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from((req.body as Uint8Array | undefined) ?? []);
      const stored = vaultWrite(name, bytes);
      log.info({ name: stored, bytes: bytes.length }, "vault upload");
      res.json({ ok: true, name: stored });
    } catch (err) {
      res.status(400).json({
        error: "upload-failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.use(express.json({ limit: "1mb" }));

  app.get("/airgap/events", (_req, res) => {
    res.json(snapshot());
  });

  app.get("/models", async (_req, res) => {
    try {
      res.json(await loadRegistry());
    } catch (err) {
      log.error({ err }, "failed to load models.yaml");
      res.status(500).json({ error: "registry-unavailable" });
    }
  });

  app.get("/ollama/health", async (_req, res) => {
    res.json(await ollamaHealth());
  });

  app.get("/conversations", (_req, res) => {
    res.json({ items: listConversations() });
  });

  app.post("/conversations", (_req, res) => {
    res.status(201).json(createConversation());
  });

  app.get("/conversations/:id", (req, res) => {
    const detail = getConversation(req.params.id);
    if (!detail) {
      res.status(404).json({ error: "not-found" });
      return;
    }
    res.json(detail);
  });

  app.patch("/conversations/:id", (req, res) => {
    const parsed = patchConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad-request", issues: parsed.error.issues });
      return;
    }
    try {
      let current = parsed.data.title
        ? setTitle(req.params.id, parsed.data.title)
        : undefined;
      if (parsed.data.pinned !== undefined) {
        current = setPinned(req.params.id, parsed.data.pinned);
      }
      if (!current) {
        const detail = getConversation(req.params.id);
        if (!detail) throw new ConversationNotFoundError(req.params.id);
        current = detail;
      }
      res.json(current);
    } catch (err) {
      if (err instanceof ConversationNotFoundError) {
        res.status(404).json({ error: "not-found" });
        return;
      }
      res.status(400).json({
        error: "patch-failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.delete("/conversations/:id", (req, res) => {
    try {
      deleteConversation(req.params.id);
      res.json({ ok: true, id: req.params.id });
    } catch (err) {
      if (err instanceof ConversationNotFoundError) {
        res.status(404).json({ error: "not-found" });
        return;
      }
      res.status(400).json({
        error: "delete-failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/artifacts", (_req, res) => {
    res.json({ items: vaultList() });
  });

  app.get("/artifacts/{*name}", (req, res, next) => {
    try {
      const name = artifactParam(req.params.name);
      const full = resolveVaultPath(name);
      res.sendFile(full);
    } catch (err) {
      next(err);
    }
  });

  app.delete("/artifacts/{*name}", (req, res) => {
    try {
      const name = artifactParam(req.params.name);
      vaultDelete(name);
      try {
        removeVaultIndex(name);
      } catch {
        // Index tables may be empty on a fresh DB; file delete still counts.
      }
      log.info({ name }, "vault delete");
      res.json({ ok: true, name });
    } catch (err) {
      res.status(400).json({
        error: "delete-failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/sandbox/health", async (_req, res) => {
    res.json(await sandboxHealth());
  });

  app.delete("/sandbox/preview/:id", async (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "missing-id" });
      return;
    }
    const result = await stopPreview(id);
    res.json(result);
  });

  // One fresh container per run. JS/TS/Python: --network=none.
  // HTML/CSS: nginx bound to 127.0.0.1. Client abort → SIGTERM then SIGKILL.
  app.post("/sandbox", async (req, res) => {
    const parsed = sandboxInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad-request", issues: parsed.error.issues });
      return;
    }
    const lang = normalizeLanguage(parsed.data.language);
    if (!lang) {
      res.status(400).json({
        error: "unsupported-language",
        language: parsed.data.language,
      });
      return;
    }

    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);

    try {
      if (isPreviewLanguage(lang)) {
        const result = await runHtmlPreview({
          code: parsed.data.code,
          language: lang,
          sessionId: parsed.data.sessionId,
        });
        res.json(result);
        return;
      }
      const result = await runSandbox(parsed.data, controller.signal);
      res.json(result);
    } catch (err) {
      if (err instanceof UnsupportedLanguageError) {
        res.status(400).json({ error: "unsupported-language", language: err.language });
        return;
      }
      log.error({ err }, "sandbox failed");
      res.status(500).json({
        kind: "run",
        ok: false,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: -1,
        timedOut: false,
        aborted: false,
      });
    } finally {
      res.off("close", onClose);
    }
  });

  // Agentic inspection beat: OCR/vision -> findings -> docx, streamed as SSE.
  const inspectInputSchema = z.object({
    name: z.string().min(1),
    tag: z.string().min(1),
  });
  app.post("/inspect", async (req, res) => {
    const parsed = inspectInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad-request", issues: parsed.error.issues });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    const controller = new AbortController();
    // `req` "close" fires once the body is read — not a client disconnect.
    // Abort only when the SSE response socket closes before we finish.
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    await pipeEvents(res, runInspect(parsed.data, controller.signal));
  });

  app.post("/chat", async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad-request", issues: parsed.error.issues });
      return;
    }

    // SSE headers. `X-Accel-Buffering: no` defeats proxy buffering; Express
    // itself does not buffer chunked responses.
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    // Stop the generator if the client disconnects mid-stream.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const lastUser = [...parsed.data.messages]
      .reverse()
      .find((m) => m.role === "user");

    const events = withPersistedDone(
      runAgent({
        messages: parsed.data.messages,
        signal: controller.signal,
        hasAttachment: parsed.data.hasAttachment,
        attachmentName: parsed.data.attachmentName,
        preferModel: parsed.data.preferModel,
      }),
      {
        conversationId: parsed.data.conversationId,
        userContent: lastUser?.content ?? "",
      },
    );
    await pipeEvents(res, events);
  });

  return app;
}

export async function listen(): Promise<void> {
  migrate();
  const app = createApp();
  // Load the model registry before accepting requests so a malformed
  // models.yaml fails boot (repo bug) rather than the first chat request.
  await loadRegistry();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(LISTEN_PORT, LISTEN_HOST, () => {
      log.info({ host: LISTEN_HOST, port: LISTEN_PORT }, "express listening");
      resolve();
    });
    server.on("error", reject);
  });

  const onSignal = () => {
    void shutdownSandbox().finally(() => process.exit(0));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  void reapOrphanSandboxes();

  // One boot-time probe. A down Ollama or a missing tag is a warning, not a
  // boot failure — Express keeps serving and the UI can show the gap.
  try {
    const health = await ollamaHealth();
    if (!health.reachable) {
      log.warn({ host: health.host, error: health.error }, "ollama unreachable at boot");
    } else if (health.missing.length > 0) {
      log.warn({ missing: health.missing }, "ollama reachable but missing registry tags");
    } else {
      log.info(
        { host: health.host, models: health.models.length },
        "ollama healthy",
      );
    }
  } catch (err) {
    log.warn({ err }, "ollama health probe failed at boot");
  }
}
