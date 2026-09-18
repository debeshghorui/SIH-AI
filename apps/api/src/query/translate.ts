import { z } from "zod";
import { ollama } from "../models/client";
import { getModel } from "../models/registry";

/**
 * Query translation stage. Four nano calls (rewrite, step-back, decompose,
 * HyDE) before routing. qwen2.5:1.5b copies few-shots and paraphrases, so
 * each transform has its own system prompt, no examples, and code drops
 * near-duplicates / plant-SOP leakage. Failures keep the previous text so
 * a weak JSON reply never blocks the pipeline.
 */

export const translatedQuerySchema = z.object({
  rewritten: z.string(),
  stepBack: z.string(),
  subQueries: z.array(z.string()),
  hyde: z.string(),
});

export type TranslatedQuery = z.infer<typeof translatedQuerySchema>;

export type RetrievalPlan = {
  queries: string[];
  hyde?: string;
};

const JSON_ONLY = "Reply ONLY with compact JSON. No markdown, no prose.";

const REWRITE_SYS = `You turn a question into a retrieval query. Keep the question's domain (code, math, plant, etc). Do not add industrial plant or SOP language unless the question is about a plant. ${JSON_ONLY}`;

const STEP_BACK_SYS = `You write a strictly broader question: the parent concept, not a paraphrase. If you cannot go broader, copy the input unchanged. ${JSON_ONLY}`;

const DECOMPOSE_SYS = `You split a question into distinct retrieval facets (definition vs cause vs related idea). Never restate the same question with different wording or punctuation. If the question is already one atomic fact, return exactly that one string. ${JSON_ONLY}`;

const HYDE_SYS = `You write a short hypothetical textbook passage that answers the question. Stay in the question's domain. Use standard terms for that subject. Do not invent timers, pauses, industrial plants, SOPs, or unrelated systems. ${JSON_ONLY}`;

const STOP = new Set([
  "the",
  "a",
  "an",
  "is",
  "in",
  "of",
  "to",
  "and",
  "or",
  "what",
  "how",
  "does",
  "do",
  "for",
  "on",
  "with",
  "why",
]);

const PLANT_WORDS =
  /\b(sop|refinery|lockout|tagout|permit to work|isolation valve|plant procedure|mrpl)\b/i;

async function nanoJson(
  system: string,
  prompt: string,
  schema: z.ZodType,
  temperature: number,
): Promise<unknown | null> {
  try {
    const res = await ollama().chat({
      model: getModel("nano").ollama,
      format: "json",
      stream: false,
      options: { temperature, num_predict: 256 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    const parsed = JSON.parse(res.message.content);
    return schema.parse(parsed);
  } catch {
    return null;
  }
}

function normalizeQuery(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function contentTokens(s: string): Set<string> {
  return new Set(
    normalizeQuery(s)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

/** True when two strings are the same query with punctuation / filler words. */
export function nearDuplicate(a: string, b: string): boolean {
  const na = normalizeQuery(a);
  const nb = normalizeQuery(b);
  if (!na || !nb) return true;
  if (na === nb) return true;
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  if (jaccard(ta, tb) >= 0.85) return true;
  return jaccard(contentTokens(a), contentTokens(b)) >= 0.8;
}

function uniqueQueries(
  queries: readonly string[],
  fallback: string,
  max = 3,
): string[] {
  const out: string[] = [];
  for (const raw of queries) {
    const q = raw.trim();
    if (!q) continue;
    if (out.some((existing) => nearDuplicate(existing, q))) continue;
    out.push(q);
    if (out.length >= max) break;
  }
  return out.length ? out : [fallback];
}

function domainLeak(query: string, text: string): boolean {
  const leaks = [
    PLANT_WORDS,
    /\b(settimeout|setinterval)\b/i,
  ];
  return leaks.some((re) => re.test(text) && !re.test(query));
}

async function rewrite(query: string): Promise<string> {
  const out = (await nanoJson(
    REWRITE_SYS,
    `If this is already a clear search query, copy it unchanged.\n{"q": string}\nQuestion: ${query}`,
    z.object({ q: z.string() }),
    0,
  )) as { q: string } | null;
  const q = out?.q?.trim() || query;
  return nearDuplicate(q, query) || domainLeak(query, q) ? query : q;
}

async function stepBack(query: string): Promise<string> {
  const out = (await nanoJson(
    STEP_BACK_SYS,
    `One broader question naming the parent concept. Not a paraphrase.\n{"q": string}\nQuestion: ${query}`,
    z.object({ q: z.string() }),
    0,
  )) as { q: string } | null;
  const q = out?.q?.trim() || query;
  return nearDuplicate(q, query) || domainLeak(query, q) ? query : q;
}

async function decompose(query: string): Promise<string[]> {
  const out = (await nanoJson(
    DECOMPOSE_SYS,
    `1-3 distinct sub-questions. If atomic, return only the input.\n{"qs": string[]}\nQuestion: ${query}`,
    z.object({ qs: z.array(z.string()) }),
    0,
  )) as { qs: string[] | undefined } | null;
  const qs = (out?.qs ?? []).map((s) => s.trim()).filter(Boolean);
  return uniqueQueries([query, ...qs], query, 3);
}

async function hyde(query: string): Promise<string> {
  const out = (await nanoJson(
    HYDE_SYS,
    `2-3 sentences a real document would use to answer this. Stay in-domain.\n{"a": string}\nQuestion: ${query}`,
    z.object({ a: z.string() }),
    0.2,
  )) as { a: string } | null;
  const a = out?.a?.trim() || "";
  if (!a || nearDuplicate(a, query) || domainLeak(query, a) || a.length < 40) {
    return query;
  }
  return a;
}

export async function translateQuery(query: string): Promise<TranslatedQuery> {
  const rewritten = await rewrite(query);
  const sb = await stepBack(rewritten);
  const subs = await decompose(rewritten);
  const h = await hyde(rewritten);
  return translatedQuerySchema.parse({
    rewritten,
    stepBack: sb,
    subQueries: subs,
    hyde: h,
  });
}

/** Unique short queries for retrieve, plus HyDE only when it is a real passage. */
export function retrievalPlan(
  translated: TranslatedQuery,
  original: string,
): RetrievalPlan {
  const queries = uniqueQueries(
    [translated.rewritten, translated.stepBack, ...translated.subQueries],
    original,
    3,
  );
  const hydeText = translated.hyde.trim();
  const keepHyde =
    hydeText.length >= 40 &&
    !nearDuplicate(hydeText, original) &&
    !queries.some((q) => nearDuplicate(hydeText, q)) &&
    !domainLeak(original, hydeText);
  return keepHyde ? { queries, hyde: hydeText } : { queries };
}
