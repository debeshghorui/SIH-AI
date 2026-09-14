import { z } from "zod";
import { ollama } from "../models/client";
import { getModel } from "../models/registry";

/**
 * Query translation stage. The product diagram calls this out as four
 * transforms before routing: rewrite, step-back, decompose, HyDE. We run a
 * compact version on the `nano` model (qwen2.5:1.5b) so the router sees a
 * cleaner, denser query than what the user typed.
 *
 * Each transform is a single structured call. They are independent and run
 * sequentially; the output of `rewrite` feeds `stepBack`, etc. Failures
 * degrade to the previous stage's output so a weak nano response can never
 * block the pipeline.
 */

export const translatedQuerySchema = z.object({
  rewritten: z.string(),
  stepBack: z.string(),
  subQueries: z.array(z.string()),
  hyde: z.string(),
});

export type TranslatedQuery = z.infer<typeof translatedQuerySchema>;

const SYSTEM = `You translate industrial plant questions for retrieval. Reply ONLY with compact JSON, no prose.`;

async function nanoJson(
  prompt: string,
  schema: z.ZodType,
): Promise<unknown | null> {
  try {
    const res = await ollama().chat({
      model: getModel("nano").ollama,
      format: "json",
      stream: false,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    });
    const parsed = JSON.parse(res.message.content);
    return schema.parse(parsed);
  } catch {
    return null;
  }
}

async function rewrite(query: string): Promise<string> {
  const out = (await nanoJson(
    `Rewrite this question as a clear, self-contained retrieval query. {"q": string}\nQuestion: ${query}`,
    z.object({ q: z.string() }),
  )) as { q: string } | null;
  return out?.q?.trim() || query;
}

async function stepBack(query: string): Promise<string> {
  const out = (await nanoJson(
    `Produce a step-back query: the broader principle or procedure behind this question. {"q": string}\nQuestion: ${query}`,
    z.object({ q: z.string() }),
  )) as { q: string } | null;
  return out?.q?.trim() || query;
}

async function decompose(query: string): Promise<string[]> {
  const out = (await nanoJson(
    `Split this question into 1-3 independent sub-questions for parallel retrieval. {"qs": string[]}\nQuestion: ${query}`,
    z.object({ qs: z.array(z.string()) }),
  )) as { qs: string[] | undefined } | null;
  const qs = out?.qs?.filter((s) => s.trim()).slice(0, 3) ?? [];
  return qs.length ? qs : [query];
}

async function hyde(query: string): Promise<string> {
  const out = (await nanoJson(
    `Write a 2-3 sentence hypothetical answer to this question in the voice of a plant SOP. {"a": string}\nQuestion: ${query}`,
    z.object({ a: z.string() }),
  )) as { a: string } | null;
  return out?.a?.trim() || query;
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
