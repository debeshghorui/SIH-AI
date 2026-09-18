import { z } from "zod";
import { ollama } from "../models/client";
import { getModel } from "../models/registry";
import type { TranslatedQuery } from "../query/translate";

/**
 * Router. Decides, for a translated query:
 *   - store:  sql | vector | files | none   (where to look)
 *   - model:  nano | chat | coder | vision   (which resident model answers)
 *   - tools:  subset of fs | ocr | sandbox | docx | search
 *   - reason: one sentence explaining the choice
 *
 * The decision is made by the `nano` model with a constrained JSON format.
 * The reason string is what the UI Trace panel shows — that visibility is
 * the whole point of a custom router (D3).
 */

export const routeDecisionSchema = z.object({
  store: z.enum(["sql", "vector", "files", "none"]),
  model: z.enum(["nano", "chat", "coder", "vision"]),
  tools: z.array(z.string()).default([]),
  reason: z.string().min(1),
});

export type RouteDecision = z.infer<typeof routeDecisionSchema>;

/** Final decision plus what nano said before the keyword guard / parse fallback. */
export type RouteResult = {
  decision: RouteDecision;
  nano: RouteDecision;
  guarded: boolean;
  parseFallback: boolean;
};

const SYSTEM = `You route industrial plant questions for a sovereign workbench. Reply ONLY with JSON matching the schema. Choose:
- store: "sql" for tag/inspection/numeric lookups, "vector" for SOP/procedure/how-to questions, "files" for uploaded scans/PDFs, "none" ONLY for small talk that needs no plant data.
- model: "chat" for SOP/answer, "vision" if the user attached an image/scan, "coder" for JS code, "nano" only for trivial rewrites.
- tools: array of any of fs, ocr, sandbox, docx, search needed to complete the task.
- reason: one short sentence.`;

const PROCEDURE_WORDS =
  /\b(sop|procedure|isolation|permit|leak test|lockout|checklist|how do i|how to|steps)\b/i;
const INSPECTION_WORDS =
  /\b(inspection|inspected|reading|calibration|history|last check|status)\b/i;
const TAG_PATTERN = /\d{2}-[a-z]{1,3}-\d{3}/i;

/**
 * The nano router (qwen2.5:1.5b) sometimes answers "none" for questions that
 * clearly need plant data, which starves the generator of context and invites
 * invented citations. Correct obvious misroutes with a keyword guard, and say
 * so in the reason so the Trace panel stays honest.
 */
function guardStore(query: string, decision: RouteDecision): RouteDecision {
  if (decision.store !== "none") return decision;

  const needsProcedure = PROCEDURE_WORDS.test(query);
  const needsRecords = INSPECTION_WORDS.test(query) || TAG_PATTERN.test(query);
  if (!needsProcedure && !needsRecords) return decision;

  const store = needsProcedure ? "vector" : "sql";
  return {
    ...decision,
    store,
    tools: decision.tools.includes("search")
      ? decision.tools
      : [...decision.tools, "search"],
    reason: `${decision.reason} (store corrected to ${store}: query references plant data)`,
  };
}

export async function route(
  query: string,
  translated: TranslatedQuery,
  opts: { hasAttachment?: boolean } = {},
): Promise<RouteResult> {
  // Only mention the attachment when there is one — a "no" line tempts the
  // nano model into reasoning about a file the user never sent.
  const userPrompt = [
    `Original: ${query}`,
    `Rewritten: ${translated.rewritten}`,
    `Step-back: ${translated.stepBack}`,
    `Sub-queries: ${translated.subQueries.join(" | ")}`,
    `HyDE: ${translated.hyde}`,
    ...(opts.hasAttachment ? ["Attachment: yes (image/scan)"] : []),
  ].join("\n");

  try {
    const res = await ollama().chat({
      model: getModel("nano").ollama,
      format: "json",
      stream: false,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(res.message.content);
    const nano = routeDecisionSchema.parse(parsed);
    const decision = guardStore(query, nano);
    return {
      decision,
      nano,
      guarded: decision.store !== nano.store,
      parseFallback: false,
    };
  } catch {
    // Fallback: a defensible default so the agent loop never stalls.
    const decision = routeDecisionSchema.parse({
      store: opts.hasAttachment ? "files" : "vector",
      model: opts.hasAttachment ? "vision" : "chat",
      tools: opts.hasAttachment ? ["ocr"] : ["search"],
      reason: "router fallback (nano parse failed)",
    });
    return {
      decision,
      nano: decision,
      guarded: false,
      parseFallback: true,
    };
  }
}
