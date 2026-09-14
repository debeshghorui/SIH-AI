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

const SYSTEM = `You route industrial plant questions for a sovereign workbench. Reply ONLY with JSON matching the schema. Choose:
- store: "sql" for tag/inspection/numeric lookups, "vector" for SOP/procedure questions, "files" for uploaded scans/PDFs, "none" for general chat.
- model: "chat" for SOP/answer, "vision" if the user attached an image/scan, "coder" for JS code, "nano" only for trivial rewrites.
- tools: array of any of fs, ocr, sandbox, docx, search needed to complete the task.
- reason: one short sentence.`;

export async function route(
  query: string,
  translated: TranslatedQuery,
  opts: { hasAttachment?: boolean } = {},
): Promise<RouteDecision> {
  const userPrompt = `Original: ${query}
Rewritten: ${translated.rewritten}
Step-back: ${translated.stepBack}
Sub-queries: ${translated.subQueries.join(" | ")}
HyDE: ${translated.hyde}
Attachment: ${opts.hasAttachment ? "yes (image/scan)" : "no"}`;

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
    return routeDecisionSchema.parse(parsed);
  } catch {
    // Fallback: a defensible default so the agent loop never stalls.
    return routeDecisionSchema.parse({
      store: opts.hasAttachment ? "files" : "vector",
      model: opts.hasAttachment ? "vision" : "chat",
      tools: opts.hasAttachment ? ["ocr"] : ["search"],
      reason: "router fallback (nano parse failed)",
    });
  }
}
