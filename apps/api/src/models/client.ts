import { Ollama, type ListResponse, type ModelResponse } from "ollama";

/**
 * The only Ollama host this app will ever talk to. Hard-coded on purpose:
 * the air-gap requirement says non-loopback HTTP is a bug, so the host is
 * not configurable via env. The air-gap interceptor on global `fetch`
 * (installed at boot) will also reject any non-loopback URL, so this is
 * defense in depth, not a single point of failure.
 */
export const OLLAMA_HOST = "http://127.0.0.1:11434";

let client: Ollama | null = null;

/**
 * Lazily created singleton. `Ollama` reads `globalThis.fetch`, which is the
 * air-gap-wrapped fetch by the time any code calls this (installAirgap runs
 * before server.ts imports anything that uses fetch).
 */
export function ollama(): Ollama {
  if (!client) {
    client = new Ollama({ host: OLLAMA_HOST });
  }
  return client;
}

/**
 * Normalize an Ollama tag so registry entries match what `ollama list`
 * returns. Ollama reports `nomic-embed-text:latest` even when the user
 * pulled it as `nomic-embed-text`; the registry stores the bare name, so we
 * append `:latest` to any tag without a colon when comparing.
 */
export function normalizeTag(tag: string): string {
  return tag.includes(":") ? tag : `${tag}:latest`;
}

/**
 * Return the tags currently present in local Ollama, normalized. Throws if
 * Ollama is unreachable — callers (health check) wrap this in try/catch.
 */
export async function listLocalTags(): Promise<string[]> {
  const res: ListResponse = await ollama().list();
  return res.models.map((m: ModelResponse) => normalizeTag(m.name));
}
