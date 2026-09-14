import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  registrySchema,
  type ModelEntry,
  type Registry,
} from "./schema";

/**
 * Resolve the repo-root `models.yaml` from this module's location:
 *   apps/api/src/models/registry.ts  ->  apps/api/src/models  (3 levels up to repo root)
 *
 *   models/  (this dir)
 *   src/     (+1)
 *   api/     (+2)
 *   apps/    (+3)
 *   <root>   (+4)
 *
 * `models.yaml` lives at the repo root, so we go up four levels.
 */
function defaultYamlPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../../../");
  return path.join(root, "models.yaml");
}

let cached: Registry | null = null;

/**
 * Load and validate `models.yaml`. A malformed registry is a repo bug, so
 * this throws (zod parse failure, missing file, empty `models`). The result
 * is cached for the process lifetime; pass `force: true` to re-read.
 *
 * @param opts.yamlPath Override path (tests).
 */
export async function loadRegistry(
  opts: { yamlPath?: string; force?: boolean } = {},
): Promise<Registry> {
  if (cached && !opts.force) return cached;

  const yamlPath = opts.yamlPath ?? defaultYamlPath();
  const raw = await readFile(yamlPath, "utf8");
  const parsed = Bun.YAML.parse(raw);
  cached = registrySchema.parse(parsed);
  return cached;
}

export function getModel(id: string, registry?: Registry): ModelEntry {
  const r = registry ?? cached;
  if (!r) {
    throw new Error(
      `getModel("${id}") called before loadRegistry(). Call loadRegistry() first.`,
    );
  }
  const found = r.models.find((m) => m.id === id);
  if (!found) {
    throw new Error(`Unknown model id: ${id}`);
  }
  return found;
}

export function modelsForSkill(skill: string, registry?: Registry): ModelEntry[] {
  const r = registry ?? cached;
  if (!r) {
    throw new Error(
      `modelsForSkill("${skill}") called before loadRegistry(). Call loadRegistry() first.`,
    );
  }
  return r.models.filter((m) => m.skills.includes(skill));
}

export function residentModels(registry?: Registry): ModelEntry[] {
  const r = registry ?? cached;
  if (!r) {
    throw new Error("residentModels() called before loadRegistry().");
  }
  return r.models.filter((m) => m.resident);
}
