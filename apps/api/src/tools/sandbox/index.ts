import { randomUUID } from "node:crypto";
import Docker from "dockerode";
import { z } from "zod";

/**
 * Sandbox tool. One fresh container per run, never reused.
 *
 *   JS/TS  → node:22-alpine  --network=none
 *   Python → python:3.12-alpine --network=none
 *   HTML/CSS → nginx:alpine, port 80 bound to 127.0.0.1 only
 *              (preview needs a loopback bind; --network=none cannot publish ports)
 *
 * Exec containers: CPU/mem caps, CapDrop ALL, 20s timeout, AutoRemove.
 * Shutdown is SIGTERM with 2s grace, then SIGKILL. Client abort takes the
 * same path. `shutdownSandbox()` stops leftover labelled containers.
 */

export const NODE_IMAGE = "node:22-alpine";
export const PYTHON_IMAGE = "python:3.12-alpine";
export const NGINX_IMAGE = "nginx:alpine";

export const SANDBOX_IMAGES = [NODE_IMAGE, PYTHON_IMAGE, NGINX_IMAGE] as const;

const CPU_QUOTA = 50_000;
const CPU_PERIOD = 100_000;
const MEM_LIMIT = 256 * 1024 * 1024;
export const SANDBOX_TIMEOUT_MS = 20_000;
export const PREVIEW_TTL_MS = 5 * 60 * 1000;
const STOP_GRACE_SEC = 2;
const SANDBOX_LABEL = "sih.sandbox";

export const SANDBOX_LANGS = [
  "js",
  "javascript",
  "jsx",
  "ts",
  "typescript",
  "tsx",
  "python",
  "py",
  "html",
  "css",
] as const;

export type SandboxLangInput = (typeof SANDBOX_LANGS)[number];
export type ExecLang = "js" | "ts" | "python";
export type PreviewLang = "html" | "css";
export type CanonicalLang = ExecLang | PreviewLang;

export const sandboxInputSchema = z.object({
  code: z.string().min(1),
  tests: z.string().optional(),
  language: z.enum(SANDBOX_LANGS).default("js"),
  sessionId: z.string().min(1).default("default"),
});

export type SandboxInput = z.input<typeof sandboxInputSchema>;

export interface SandboxLimits {
  image: string;
  network: string;
  cpu: string;
  mem: string;
  timeout: string;
}

export interface SandboxResult {
  kind: "run";
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  aborted: boolean;
  image: string;
  limits: SandboxLimits;
}

export interface PreviewResult {
  kind: "preview";
  ok: boolean;
  previewUrl: string;
  previewId: string;
  expiresAt: string;
  stderr: string;
  image: string;
  limits: SandboxLimits;
}

export interface SandboxHealth {
  dockerUp: boolean;
  images: Record<(typeof SANDBOX_IMAGES)[number], boolean>;
  error?: string;
}

export class UnsupportedLanguageError extends Error {
  constructor(readonly language: string) {
    super(`unsupported-language: ${language}`);
    this.name = "UnsupportedLanguageError";
  }
}

const LANG_ALIAS: Record<string, CanonicalLang> = {
  js: "js",
  javascript: "js",
  jsx: "js",
  ts: "ts",
  typescript: "ts",
  tsx: "ts",
  python: "python",
  py: "python",
  html: "html",
  css: "css",
};

export function normalizeLanguage(raw: string | undefined): CanonicalLang | null {
  if (!raw) return "js";
  return LANG_ALIAS[raw.trim().toLowerCase()] ?? null;
}

export function isPreviewLanguage(lang: CanonicalLang): lang is PreviewLang {
  return lang === "html" || lang === "css";
}

function execImage(lang: ExecLang): string {
  return lang === "python" ? PYTHON_IMAGE : NODE_IMAGE;
}

function limitsFor(image: string, network: string, timeout: string): SandboxLimits {
  return {
    image,
    network,
    cpu: "50%",
    mem: "256MB",
    timeout,
  };
}

function failRun(
  image: string,
  stderr: string,
  extra?: Partial<SandboxResult>,
): SandboxResult {
  return {
    kind: "run",
    ok: false,
    stdout: "",
    stderr,
    exitCode: extra?.exitCode ?? -1,
    timedOut: extra?.timedOut ?? false,
    aborted: extra?.aborted ?? false,
    image,
    limits: limitsFor(image, "none", "20s"),
    ...extra,
  };
}

let docker: Docker | null = null;
function client(): Docker {
  if (!docker) docker = new Docker();
  return docker;
}

const live = new Set<Docker.Container>();

type PreviewRecord = {
  id: string;
  sessionId: string;
  container: Docker.Container;
  timer: ReturnType<typeof setTimeout>;
  expiresAt: number;
  port: number;
};

const previewsById = new Map<string, PreviewRecord>();
const previewIdBySession = new Map<string, string>();

let shutdownPromise: Promise<void> | null = null;

function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function decodeAndRun(dest: string, body: string, thenCmd: string): string {
  const b64 = Buffer.from(body, "utf8").toString("base64");
  return `printf '%s' '${b64}' | base64 -d > ${dest} && ${thenCmd}`;
}

async function imagePresent(name: string): Promise<boolean> {
  try {
    await client().getImage(name).inspect();
    return true;
  } catch {
    return false;
  }
}

async function forceRemove(container: Docker.Container): Promise<void> {
  try {
    await withTimeout(container.remove({ force: true }), 4_000, "remove-timeout");
  } catch {
    // AutoRemove, already gone, or daemon wedged on this id.
  }
}

async function gracefulStop(container: Docker.Container): Promise<void> {
  try {
    await withTimeout(container.stop({ t: STOP_GRACE_SEC }), 5_000, "stop-timeout");
  } catch {
    try {
      await withTimeout(container.kill("SIGKILL"), 3_000, "kill-timeout");
    } catch {
      // already exited
    }
  }
}

function demuxPayload(buf: Buffer): { stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  let leftover = buf;
  while (leftover.length >= 8) {
    const streamType = leftover[0];
    const payloadLen = leftover.readUInt32BE(4);
    if (leftover.length < 8 + payloadLen) break;
    const payload = leftover.subarray(8, 8 + payloadLen).toString("utf8");
    if (streamType === 2) stderr += payload;
    else stdout += payload;
    leftover = leftover.subarray(8 + payloadLen);
  }
  if (!stdout && !stderr && buf.length > 0) {
    stdout = buf.toString("utf8");
  }
  return { stdout, stderr };
}

async function readLogs(container: Docker.Container): Promise<{ stdout: string; stderr: string }> {
  try {
    const raw = await container.logs({ stdout: true, stderr: true });
    const buf = Buffer.isBuffer(raw)
      ? raw
      : Buffer.from((raw as { toString: () => string }).toString());
    return demuxPayload(buf);
  } catch {
    return { stdout: "", stderr: "" };
  }
}

function execSpec(lang: ExecLang): { dest: string; thenCmd: string } {
  if (lang === "python") {
    return { dest: "/tmp/program.py", thenCmd: "python3 /tmp/program.py" };
  }
  if (lang === "ts") {
    return {
      dest: "/tmp/program.mts",
      thenCmd:
        "node --experimental-strip-types --disable-warning=ExperimentalWarning /tmp/program.mts",
    };
  }
  return { dest: "/tmp/program.mjs", thenCmd: "node /tmp/program.mjs" };
}

function execBody(lang: ExecLang, code: string, tests?: string): string {
  if (lang === "python") return code;
  const testBlock = tests
    ? `\nimport { test } from "node:test";\nimport assert from "node:assert";\n${tests}\n`
    : "";
  return `${code}\n${testBlock}`;
}

/**
 * Run JS/TS/Python in a disposable `--network=none` container.
 */
export async function runSandbox(
  input: SandboxInput,
  signal?: AbortSignal,
): Promise<SandboxResult> {
  const parsed = sandboxInputSchema.parse(input);
  const lang = normalizeLanguage(parsed.language);
  if (!lang) throw new UnsupportedLanguageError(parsed.language);
  if (isPreviewLanguage(lang)) {
    throw new UnsupportedLanguageError(parsed.language);
  }

  const image = execImage(lang);
  const { dest, thenCmd } = execSpec(lang);
  const body = execBody(lang, parsed.code, parsed.tests);
  const cmd = decodeAndRun(dest, body, thenCmd);

  if (signal?.aborted) {
    return failRun(image, "aborted before start", { aborted: true, exitCode: 137 });
  }

  try {
    await client().ping();
  } catch (err) {
    return failRun(image, `Docker daemon unreachable: ${String(err)}`);
  }

  if (!(await imagePresent(image))) {
    return failRun(
      image,
      `image ${image} not found. Run bun run sandbox:prepull`,
    );
  }

  const name = `sih-sbx-${shortId()}`;
  let container: Docker.Container | null = null;

  const timeoutSignal = AbortSignal.timeout(SANDBOX_TIMEOUT_MS);
  const combined = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    container = await client().createContainer({
      Image: image,
      name,
      Entrypoint: ["/bin/sh", "-c"],
      Cmd: [cmd],
      WorkingDir: "/tmp",
      Env: ["NODE_NO_WARNINGS=1"],
      Labels: { [SANDBOX_LABEL]: "1" },
      OpenStdin: false,
      Tty: false,
      HostConfig: {
        NetworkMode: "none",
        CpuQuota: CPU_QUOTA,
        CpuPeriod: CPU_PERIOD,
        Memory: MEM_LIMIT,
        MemorySwap: MEM_LIMIT,
        AutoRemove: false,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        PidsLimit: 64,
      },
    });
    live.add(container);

    const abortNow = () => {
      if (container) void gracefulStop(container);
    };
    if (combined.aborted) abortNow();
    else combined.addEventListener("abort", abortNow, { once: true });

    await container.start();

    const abortDone = new Promise<"abort">((resolve) => {
      if (combined.aborted) {
        resolve("abort");
        return;
      }
      combined.addEventListener("abort", () => resolve("abort"), { once: true });
    });

    const waitDone = container
      .wait()
      .then((result) => ({ type: "exit" as const, code: Number(result?.StatusCode ?? -1) }))
      .catch(() => ({ type: "exit" as const, code: -1 }));

    const outcome = await Promise.race([
      waitDone,
      abortDone.then(() => ({ type: "abort" as const })),
    ]);

    const logs = await readLogs(container);

    if (outcome.type === "abort") {
      await gracefulStop(container);
      const timedOut = timeoutSignal.aborted && !signal?.aborted;
      return {
        kind: "run",
        ok: false,
        stdout: logs.stdout,
        stderr: logs.stderr,
        exitCode: 137,
        timedOut,
        aborted: !timedOut,
        image,
        limits: limitsFor(image, "none", "20s"),
      };
    }

    return {
      kind: "run",
      ok: outcome.code === 0,
      stdout: logs.stdout,
      stderr: logs.stderr,
      exitCode: outcome.code,
      timedOut: false,
      aborted: false,
      image,
      limits: limitsFor(image, "none", "20s"),
    };
  } catch (err) {
    return failRun(image, err instanceof Error ? err.message : String(err));
  } finally {
    if (container) {
      live.delete(container);
      await forceRemove(container);
    }
  }
}

function wrapCss(css: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sandbox CSS</title>
<style>
${css}
</style>
</head>
<body>
<main class="sandbox-preview">
  <p>CSS preview</p>
  <div class="box"></div>
</main>
</body>
</html>`;
}

function ensureHtmlDocument(code: string): string {
  if (/<!DOCTYPE/i.test(code) || /<html[\s>]/i.test(code)) return code;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sandbox</title>
</head>
<body>
${code}
</body>
</html>`;
}

async function waitForHostPort(
  container: Docker.Container,
  timeoutMs = 8_000,
): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const info = await container.inspect();
      const binding = info.NetworkSettings?.Ports?.["80/tcp"];
      const hostPort = binding?.[0]?.HostPort;
      if (hostPort) return Number(hostPort);
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("preview port not bound");
}

function failPreview(stderr: string): PreviewResult {
  return {
    kind: "preview",
    ok: false,
    previewUrl: "",
    previewId: "",
    expiresAt: new Date(0).toISOString(),
    stderr,
    image: NGINX_IMAGE,
    limits: limitsFor(NGINX_IMAGE, "loopback", "ttl 5m"),
  };
}

/**
 * Serve HTML/CSS from nginx bound to 127.0.0.1. One preview per session;
 * a new run replaces the previous container.
 */
export async function runHtmlPreview(input: {
  code: string;
  language: PreviewLang;
  sessionId?: string;
}): Promise<PreviewResult> {
  const sessionId = input.sessionId ?? "default";
  const html =
    input.language === "css" ? wrapCss(input.code) : ensureHtmlDocument(input.code);

  try {
    await client().ping();
  } catch (err) {
    return failPreview(`Docker daemon unreachable: ${String(err)}`);
  }

  if (!(await imagePresent(NGINX_IMAGE))) {
    return failPreview(`image ${NGINX_IMAGE} not found. Run bun run sandbox:prepull`);
  }

  const existingId = previewIdBySession.get(sessionId);
  if (existingId) await stopPreview(existingId);

  const id = shortId();
  const name = `sih-prev-${id}`;
  let container: Docker.Container | null = null;

  try {
    container = await client().createContainer({
      Image: NGINX_IMAGE,
      name,
      Labels: { [SANDBOX_LABEL]: "preview" },
      Entrypoint: ["/bin/sh", "-c"],
      Cmd: [
        `printf '%s' '${Buffer.from(html, "utf8").toString("base64")}' | base64 -d > /usr/share/nginx/html/index.html && exec nginx -g 'daemon off;'`,
      ],
      ExposedPorts: { "80/tcp": {} },
      HostConfig: {
        NetworkMode: "bridge",
        CpuQuota: CPU_QUOTA,
        CpuPeriod: CPU_PERIOD,
        Memory: MEM_LIMIT,
        MemorySwap: MEM_LIMIT,
        AutoRemove: false,
        SecurityOpt: ["no-new-privileges:true"],
        PidsLimit: 32,
        Dns: ["127.0.0.1"],
        PortBindings: {
          "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "" }],
        },
      },
    });
    live.add(container);

    await container.start();
    const port = await waitForHostPort(container);
    const expiresAt = Date.now() + PREVIEW_TTL_MS;
    const timer = setTimeout(() => {
      void stopPreview(id);
    }, PREVIEW_TTL_MS);

    const record: PreviewRecord = {
      id,
      sessionId,
      container,
      timer,
      expiresAt,
      port,
    };
    previewsById.set(id, record);
    previewIdBySession.set(sessionId, id);

    return {
      kind: "preview",
      ok: true,
      previewUrl: `http://127.0.0.1:${port}/`,
      previewId: id,
      expiresAt: new Date(expiresAt).toISOString(),
      stderr: "",
      image: NGINX_IMAGE,
      limits: limitsFor(NGINX_IMAGE, "loopback", "ttl 5m"),
    };
  } catch (err) {
    if (container) {
      live.delete(container);
      await gracefulStop(container);
      await forceRemove(container);
    }
    return failPreview(err instanceof Error ? err.message : String(err));
  }
}

export async function stopPreview(id: string): Promise<{ ok: boolean }> {
  const record = previewsById.get(id);
  if (!record) return { ok: false };
  clearTimeout(record.timer);
  previewsById.delete(id);
  if (previewIdBySession.get(record.sessionId) === id) {
    previewIdBySession.delete(record.sessionId);
  }
  live.delete(record.container);
  await gracefulStop(record.container);
  await forceRemove(record.container);
  return { ok: true };
}

export async function sandboxHealth(): Promise<SandboxHealth> {
  const images = {
    [NODE_IMAGE]: false,
    [PYTHON_IMAGE]: false,
    [NGINX_IMAGE]: false,
  } as SandboxHealth["images"];
  try {
    await client().ping();
    images[NODE_IMAGE] = await imagePresent(NODE_IMAGE);
    images[PYTHON_IMAGE] = await imagePresent(PYTHON_IMAGE);
    images[NGINX_IMAGE] = await imagePresent(NGINX_IMAGE);
    return { dockerUp: true, images };
  } catch (err) {
    return {
      dockerUp: false,
      images,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function pullSandboxImages(
  onProgress?: (image: string, status: string) => void,
): Promise<void> {
  const dockerClient = client();
  for (const image of SANDBOX_IMAGES) {
    onProgress?.(image, "pulling");
    await new Promise<void>((resolve, reject) => {
      dockerClient.pull(image, (err: Error | null, stream?: NodeJS.ReadableStream) => {
        if (err || !stream) {
          reject(err ?? new Error(`pull failed: ${image}`));
          return;
        }
        dockerClient.modem.followProgress(
          stream,
          (followErr: Error | null) => {
            if (followErr) reject(followErr);
            else resolve();
          },
          (event: { status?: string; id?: string }) => {
            const bit = [event.status, event.id].filter(Boolean).join(" ");
            if (bit) onProgress?.(image, bit);
          },
        );
      });
    });
    onProgress?.(image, "ready");
  }
}

async function reapLabelled(): Promise<void> {
  try {
    const listed = await client().listContainers({ all: true });
    await Promise.all(
      listed.map(async (info) => {
        const labels = info.Labels ?? {};
        const names = info.Names ?? [];
        const ours =
          labels[SANDBOX_LABEL] != null ||
          names.some((n) => n.includes("sih-sbx-") || n.includes("sih-prev-"));
        if (!ours) return;
        try {
          await client().getContainer(info.Id).remove({ force: true });
        } catch {
          // gone
        }
      }),
    );
  } catch {
    // daemon down
  }
}

/**
 * Stop in-flight exec containers and HTML previews. Idempotent.
 */
export function shutdownSandbox(): Promise<void> {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      const previewIds = [...previewsById.keys()];
      await Promise.all(previewIds.map((id) => stopPreview(id)));
      const running = [...live];
      live.clear();
      await Promise.all(
        running.map(async (container) => {
          await gracefulStop(container);
          await forceRemove(container);
        }),
      );
      await reapLabelled();
    })().finally(() => {
      shutdownPromise = null;
    });
  }
  return shutdownPromise;
}

/** Drop leftover sandbox containers from a previous crash. */
export async function reapOrphanSandboxes(): Promise<void> {
  await reapLabelled();
}
