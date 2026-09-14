import express from "express";
import pino from "pino";
import { z } from "zod";
import { snapshot } from "./airgap/log";
import { loadRegistry } from "./models/registry";
import { ollamaHealth } from "./models/health";
import { runAgent } from "./agent/loop";
import { runInspect } from "./agent/inspect";
import { pipeEvents } from "./agent/sse";
import { vaultList, resolveVaultPath, vaultWrite, vaultDelete } from "./tools/fs";
import { runSandbox } from "./tools/sandbox";

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
});

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
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

  app.get("/artifacts", (_req, res) => {
    res.json({ items: vaultList() });
  });

  app.get("/artifacts/:name", (req, res, next) => {
    try {
      const full = resolveVaultPath(req.params.name);
      res.sendFile(full);
    } catch (err) {
      next(err);
    }
  });

  app.delete("/artifacts/:name", (req, res) => {
    try {
      vaultDelete(req.params.name);
      log.info({ name: req.params.name }, "vault delete");
      res.json({ ok: true, name: req.params.name });
    } catch (err) {
      res.status(400).json({
        error: "delete-failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Upload a scan to the vault. Accepts raw body (the file bytes) with a
  // ?name= query for the vault filename. Keeps the agent host stateless.
  app.post("/upload", express.raw({ type: "*/*", limit: "20mb" }), (req, res) => {
    const name = req.query.name;
    if (typeof name !== "string" || !name) {
      res.status(400).json({ error: "missing ?name=" });
      return;
    }
    try {
      vaultWrite(name, req.body as unknown as string);
      log.info({ name, bytes: (req.body as unknown as Uint8Array).length }, "vault upload");
      res.json({ ok: true, name });
    } catch (err) {
      res.status(400).json({
        error: "upload-failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Coding beat: run JS in a disposable Docker container (--network=none).
  const sandboxInputSchema = z.object({
    code: z.string().min(1),
    tests: z.string().optional(),
  });
  app.post("/sandbox", async (req, res) => {
    const parsed = sandboxInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad-request", issues: parsed.error.issues });
      return;
    }
    try {
      const result = await runSandbox(parsed.data);
      res.json(result);
    } catch (err) {
      log.error({ err }, "sandbox failed");
      res.status(500).json({
        ok: false,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: -1,
        timedOut: false,
      });
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

    const events = runAgent({
      messages: parsed.data.messages,
      signal: controller.signal,
      hasAttachment: parsed.data.hasAttachment,
      attachmentName: parsed.data.attachmentName,
    });
    await pipeEvents(res, events);
  });

  return app;
}

export async function listen(): Promise<void> {
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
