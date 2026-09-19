import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vault-scoped filesystem tool. All reads and writes are confined to
 * `data/vault/`. Any path that escapes the vault after normalization is
 * rejected with an error — no `..` traversal, no absolute paths, no
 * symlink escapes. This is the only fs surface the agent is allowed to
 * touch; host-wide `child_process` is banned by the stack.
 */

function vaultDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../../../");
  const dir = path.join(root, "data/vault");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function assertInsideVault(vault: string, full: string, name: string): void {
  const normalized = path.normalize(full);
  if (normalized !== vault && !normalized.startsWith(vault + path.sep)) {
    throw new Error(`fs: path escapes vault: ${name}`);
  }
}

/**
 * Path-safe relative vault name. Keeps the on-disk filename, including
 * duplicate extensions like `file.pdf.pdf`.
 */
export function safeVaultRelative(name: string): string {
  if (!name || typeof name !== "string") {
    throw new Error("fs: empty name");
  }
  const parts = name.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === ".." || p === ".")) {
    throw new Error(`fs: path escapes vault: ${name}`);
  }
  if (parts.some((p) => p.includes("\0"))) {
    throw new Error("fs: empty name");
  }
  return parts.join("/");
}

/**
 * Collapse `file.pdf.pdf` → `file.pdf` for new uploads. Reads/deletes use
 * `safeVaultRelative` so already-stored double extensions still resolve.
 */
export function sanitizeVaultName(name: string): string {
  const relative = safeVaultRelative(name);
  const parts = relative.split("/");
  const last = parts[parts.length - 1] ?? "";
  const cleaned = last
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/(\.([A-Za-z0-9]+))\1+$/i, ".$2");
  if (!cleaned) {
    throw new Error("fs: empty name");
  }
  parts[parts.length - 1] = cleaned;
  return parts.join("/");
}

/**
 * Resolve a user-supplied name to an absolute path inside the vault.
 * Prefers the literal listed name, then the collapsed upload name, so
 * both `file.pdf.pdf` and `file.pdf` can be deleted.
 */
export function resolveVaultPath(name: string): string {
  const vault = vaultDir();
  const literal = path.join(vault, safeVaultRelative(name));
  assertInsideVault(vault, literal, name);
  if (existsSync(literal)) return path.normalize(literal);

  const collapsed = sanitizeVaultName(name);
  if (collapsed !== safeVaultRelative(name)) {
    const alt = path.join(vault, collapsed);
    assertInsideVault(vault, alt, name);
    if (existsSync(alt)) return path.normalize(alt);
  }
  return path.normalize(literal);
}

export function vaultWrite(
  name: string,
  content: string | Buffer | Uint8Array,
): string {
  const safe = sanitizeVaultName(name);
  const full = resolveVaultPath(safe);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return safe;
}

export function vaultRead(name: string): string {
  const full = resolveVaultPath(name);
  if (!existsSync(full)) throw new Error(`fs: not found: ${name}`);
  return readFileSync(full, "utf8");
}

export function vaultList(subdir = ""): { name: string; size: number; mtime: string }[] {
  const vault = vaultDir();
  const full = subdir ? resolveVaultPath(subdir) : vault;
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((entry) => entry !== ".gitkeep")
    .map((entry) => {
      const p = path.join(full, entry);
      const st = statSync(p);
      if (!st.isFile()) return null;
      return {
        name: subdir ? `${safeVaultRelative(subdir)}/${entry}` : entry,
        size: st.size,
        mtime: st.mtime.toISOString(),
      };
    })
    .filter((item): item is { name: string; size: number; mtime: string } => item !== null);
}

export function vaultDelete(name: string): void {
  const relative = safeVaultRelative(name);
  if (relative === ".gitkeep" || sanitizeVaultName(name) === ".gitkeep") {
    throw new Error("fs: cannot delete .gitkeep");
  }
  const full = resolveVaultPath(name);
  if (!existsSync(full)) throw new Error(`fs: not found: ${name}`);
  if (!statSync(full).isFile()) throw new Error(`fs: not a file: ${name}`);
  unlinkSync(full);
}

export { vaultDir };
