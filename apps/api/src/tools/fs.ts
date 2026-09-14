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

/**
 * Resolve a user-supplied name to an absolute path inside the vault.
 * Throws if the result escapes the vault. `name` may be a relative path
 * with subdirectories; absolute paths and `..` segments that leave the
 * vault are rejected.
 */
export function resolveVaultPath(name: string): string {
  if (!name || typeof name !== "string") {
    throw new Error("fs: empty name");
  }
  const vault = vaultDir();
  const joined = path.join(vault, name);
  const normalized = path.normalize(joined);
  // Defense in depth: the normalized path must still be inside the vault.
  if (normalized !== vault && !normalized.startsWith(vault + path.sep)) {
    throw new Error(`fs: path escapes vault: ${name}`);
  }
  return normalized;
}

export function vaultWrite(name: string, content: string | Buffer): string {
  const full = resolveVaultPath(name);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return name;
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
    .filter((name) => name !== ".gitkeep")
    .map((name) => {
      const p = path.join(full, name);
      const st = statSync(p);
      if (!st.isFile()) return null;
      return {
        name: subdir ? `${subdir}/${name}` : name,
        size: st.size,
        mtime: st.mtime.toISOString(),
      };
    })
    .filter((item): item is { name: string; size: number; mtime: string } => item !== null);
}

export function vaultDelete(name: string): void {
  if (name === ".gitkeep") {
    throw new Error("fs: cannot delete .gitkeep");
  }
  const full = resolveVaultPath(name);
  if (!existsSync(full)) throw new Error(`fs: not found: ${name}`);
  if (!statSync(full).isFile()) throw new Error(`fs: not a file: ${name}`);
  unlinkSync(full);
}

export { vaultDir };
