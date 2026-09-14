import { z } from "zod";
import { OLLAMA_HOST, listLocalTags, normalizeTag } from "./client";
import { loadRegistry } from "./registry";
import type { ModelEntry } from "./schema";

export const healthModelSchema = z.object({
  id: z.string(),
  ollama: z.string(),
  resident: z.boolean(),
  present: z.boolean(),
});

export const ollamaHealthSchema = z.object({
  host: z.string(),
  reachable: z.boolean(),
  error: z.string().optional(),
  models: z.array(healthModelSchema),
  missing: z.array(z.string()),
});

export type OllamaHealth = z.infer<typeof ollamaHealthSchema>;
export type HealthModel = z.infer<typeof healthModelSchema>;

/**
 * Probe local Ollama and cross-check the registry against the tags that are
 * actually pulled. Never throws: a down Ollama or a missing tag is a
 * degraded-but-serving state, not a boot failure. The caller decides whether
 * to log a warning.
 */
export async function ollamaHealth(): Promise<OllamaHealth> {
  const registry = await loadRegistry();

  let localTags: string[];
  try {
    localTags = await listLocalTags();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return ollamaHealthSchema.parse({
      host: OLLAMA_HOST,
      reachable: false,
      error,
      models: registry.models.map((m) => ({
        id: m.id,
        ollama: m.ollama,
        resident: m.resident,
        present: false,
      })),
      missing: registry.models.map((m) => m.ollama),
    });
  }

  const localSet = new Set(localTags);
  const models: HealthModel[] = registry.models.map((m: ModelEntry) => ({
    id: m.id,
    ollama: m.ollama,
    resident: m.resident,
    present: localSet.has(normalizeTag(m.ollama)),
  }));
  const missing = models.filter((m) => !m.present).map((m) => m.ollama);

  return ollamaHealthSchema.parse({
    host: OLLAMA_HOST,
    reachable: true,
    models,
    missing,
  });
}
