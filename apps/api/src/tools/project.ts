import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { vaultDir } from "./fs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PROJECT_EXTS = [
  "html",
  "css",
  "js",
  "mjs",
  "ts",
  "mts",
  "py",
  "json",
  "txt",
  "md",
  "csv",
] as const;

const ALLOWED_EXT = new Set<string>(PROJECT_EXTS);
export const MAX_PROJECT_FILES = 20;
export const MAX_FILE_BYTES = 200 * 1024;

export type ProjectFile = {
  path: string;
  size: number;
  mtime: string;
  content: string;
};

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

export function assertConversationId(id: string): string {
  if (!id || !UUID.test(id)) {
    throw new ProjectError("project: invalid conversation id");
  }
  return id.toLowerCase();
}

export function projectDir(conversationId: string): string {
  const id = assertConversationId(conversationId);
  const root = path.join(vaultDir(), "projects", id);
  mkdirSync(root, { recursive: true });
  const vault = vaultDir();
  const normalized = path.normalize(root);
  if (normalized !== vault && !normalized.startsWith(vault + path.sep)) {
    throw new ProjectError("project: path escapes vault");
  }
  return normalized;
}

export function safeProjectRel(rel: string): string {
  if (!rel || typeof rel !== "string") {
    throw new ProjectError("project: empty path");
  }
  if (rel.startsWith("/") || rel.startsWith("\\") || rel.includes(":")) {
    throw new ProjectError(`project: path escapes project: ${rel}`);
  }
  const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0 || parts.length > 3) {
    throw new ProjectError(`project: path escapes project: ${rel}`);
  }
  if (parts.some((p) => p === ".." || p === "." || p.includes("\0"))) {
    throw new ProjectError(`project: path escapes project: ${rel}`);
  }
  const cleaned = parts.map((p) =>
    p.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_"),
  );
  if (cleaned.some((p) => !p || p === "_" || p === ".")) {
    throw new ProjectError(`project: empty path`);
  }
  const last = cleaned[cleaned.length - 1] ?? "";
  const dot = last.lastIndexOf(".");
  const ext = dot >= 0 ? last.slice(dot + 1).toLowerCase() : "";
  if (!ext || !ALLOWED_EXT.has(ext)) {
    throw new ProjectError(`project: extension not allowed: ${rel}`);
  }
  return cleaned.join("/");
}

function resolveInProject(conversationId: string, rel: string): string {
  const root = projectDir(conversationId);
  const safe = safeProjectRel(rel);
  const full = path.normalize(path.join(root, safe));
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new ProjectError(`project: path escapes project: ${rel}`);
  }
  return full;
}

function walkFiles(dir: string, prefix: string): ProjectFile[] {
  if (!existsSync(dir)) return [];
  const out: ProjectFile[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (st.isDirectory()) {
      out.push(...walkFiles(full, rel));
    } else if (st.isFile()) {
      out.push({
        path: rel.replace(/\\/g, "/"),
        size: st.size,
        mtime: st.mtime.toISOString(),
        content: readFileSync(full, "utf8"),
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function listTree(conversationId: string): ProjectFile[] {
  const root = projectDir(conversationId);
  return walkFiles(root, "");
}

export function readProjectFile(
  conversationId: string,
  rel: string,
): string {
  const full = resolveInProject(conversationId, rel);
  if (!existsSync(full) || !statSync(full).isFile()) {
    throw new ProjectError(`project: not found: ${rel}`);
  }
  return readFileSync(full, "utf8");
}

export function writeProjectFile(
  conversationId: string,
  rel: string,
  content: string,
): string {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw new ProjectError("project: file too large");
  }
  const safe = safeProjectRel(rel);
  const existing = listTree(conversationId);
  const replacing = existing.some((f) => f.path === safe);
  if (!replacing && existing.length >= MAX_PROJECT_FILES) {
    throw new ProjectError("project: too many files");
  }
  const full = resolveInProject(conversationId, safe);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  return safe;
}

export function deleteProjectFile(
  conversationId: string,
  rel: string,
): void {
  const full = resolveInProject(conversationId, rel);
  if (!existsSync(full)) throw new ProjectError(`project: not found: ${rel}`);
  if (!statSync(full).isFile()) {
    throw new ProjectError(`project: not a file: ${rel}`);
  }
  unlinkSync(full);
}

export function deleteProject(conversationId: string): void {
  const id = assertConversationId(conversationId);
  const root = path.join(vaultDir(), "projects", id);
  const vault = vaultDir();
  const normalized = path.normalize(root);
  if (normalized === vault || !normalized.startsWith(vault + path.sep)) {
    throw new ProjectError("project: path escapes vault");
  }
  if (existsSync(normalized)) {
    rmSync(normalized, { recursive: true, force: true });
  }
}

export function projectSnapshot(conversationId: string): string {
  const files = listTree(conversationId);
  if (files.length === 0) return "";
  return files
    .map((f) => {
      let body = "";
      try {
        body = readProjectFile(conversationId, f.path);
      } catch {
        body = "";
      }
      const clipped =
        body.length > 8_000
          ? `${body.slice(0, 8_000)}\n…(truncated)`
          : body;
      return `### ${f.path}\n\`\`\`\n${clipped}\n\`\`\``;
    })
    .join("\n\n");
}

export function hasProjectFile(
  conversationId: string,
  rel: string,
): boolean {
  try {
    const full = resolveInProject(conversationId, rel);
    return existsSync(full) && statSync(full).isFile();
  } catch {
    return false;
  }
}

export type ProjectRunPlan =
  | { mode: "preview" }
  | { mode: "run"; lang: "js" | "ts" | "python"; cmd: string };

export function planProjectRun(
  conversationId: string,
  mode?: "preview" | "run",
): ProjectRunPlan {
  const files = listTree(conversationId).map((f) => f.path);
  if (files.length === 0) {
    throw new ProjectError("project: empty");
  }
  const hasHtml = files.includes("index.html");
  if (mode === "preview" || (!mode && hasHtml)) {
    if (!hasHtml) throw new ProjectError("project: no index.html to preview");
    return { mode: "preview" };
  }
  const tests = files.filter((p) => /\.test\.(js|mjs|ts|mts)$/i.test(p));
  if (tests.length > 0) {
    const ts = tests.some((p) => /\.tsx?$/i.test(p) || p.endsWith(".mts"));
    return {
      mode: "run",
      lang: ts ? "ts" : "js",
      cmd: ts
        ? "node --experimental-strip-types --disable-warning=ExperimentalWarning --test"
        : "node --test",
    };
  }
  if (files.includes("main.py") || files.includes("app.py")) {
    const dest = files.includes("main.py") ? "main.py" : "app.py";
    return { mode: "run", lang: "python", cmd: `python3 /work/${dest}` };
  }
  const py = files.find((p) => p.endsWith(".py"));
  if (py) {
    return { mode: "run", lang: "python", cmd: `python3 /work/${py}` };
  }
  if (files.includes("main.ts") || files.includes("index.ts")) {
    const dest = files.includes("main.ts") ? "main.ts" : "index.ts";
    return {
      mode: "run",
      lang: "ts",
      cmd: `node --experimental-strip-types --disable-warning=ExperimentalWarning /work/${dest}`,
    };
  }
  if (files.includes("main.js") || files.includes("index.js")) {
    const dest = files.includes("main.js") ? "main.js" : "index.js";
    return { mode: "run", lang: "js", cmd: `node /work/${dest}` };
  }
  const ts = files.find((p) => p.endsWith(".ts") || p.endsWith(".mts"));
  if (ts) {
    return {
      mode: "run",
      lang: "ts",
      cmd: `node --experimental-strip-types --disable-warning=ExperimentalWarning /work/${ts}`,
    };
  }
  const js = files.find((p) => p.endsWith(".js") || p.endsWith(".mjs"));
  if (js) {
    return { mode: "run", lang: "js", cmd: `node /work/${js}` };
  }
  if (hasHtml) return { mode: "preview" };
  throw new ProjectError("project: no runnable entry");
}
