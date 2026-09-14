import { z } from "zod";
import { ollama } from "../models/client";
import { getModel } from "../models/registry";
import { extractFindings } from "../tools/ocr";
import { writeApprovalNote, type ApprovalNote } from "../tools/docx/writer";
import { retrieveSql } from "../retrieve/retrieve";
import type { AgentEvent } from "../agent/events";

/**
 * Agentic inspection beat (demo beats 2 + 3). Given a scanned inspection
 * already in the vault, this runs:
 *   1. OCR + vision over the scan          -> emit `observe` (raw findings)
 *   2. Ask the chat model to structure the findings into a table  -> emit `plan`
 *   3. Pull the tag's last inspection from SQL  -> emit `observe`
 *   4. Write approval_note.docx into the vault  -> emit `observe`
 *   5. Stream a short summary as tokens        -> emit `token` / `done`
 *
 * Every Ollama call goes through the air-gap-wrapped fetch.
 */

export const inspectInputSchema = z.object({
  name: z.string().min(1), // vault file name of the scan
  tag: z.string().min(1), // plant tag, e.g. 12-P-104
});

export type InspectInput = z.infer<typeof inspectInputSchema>;

export async function* runInspect(
  input: InspectInput,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent, void, unknown> {
  // 1. OCR + vision
  yield { type: "plan", thought: `OCR + vision over ${input.name}` };
  let ocrText = "";
  let visionFindings = "";
  try {
    const out = await extractFindings(input.name);
    ocrText = out.text;
    visionFindings = out.vision;
    yield {
      type: "observe",
      tool: "ocr",
      result: `OCR: ${ocrText.slice(0, 300)}\nVision: ${visionFindings.slice(0, 300)}`,
    };
  } catch (err) {
    yield {
      type: "error",
      message: `ocr failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2. Structure findings with the chat model.
  yield { type: "plan", thought: "structuring findings into a table" };
  let structured: { findings: string[]; summary: string } = { findings: [], summary: "" };
  try {
    const chat = getModel("chat");
    const res = await ollama().chat({
      model: chat.ollama,
      format: "json",
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You structure plant inspection findings. Reply ONLY with JSON: " +
            '{"summary": string, "findings": string[]} where each finding is "status: detail".',
        },
        {
          role: "user",
          content:
            `Tag: ${input.tag}\nOCR text:\n${ocrText.slice(0, 3000)}` +
            (visionFindings && !visionFindings.includes("unavailable")
              ? `\n\nVision findings:\n${visionFindings.slice(0, 1500)}`
              : ""),
        },
      ],
    });
    structured = z
      .object({ summary: z.string(), findings: z.array(z.string()) })
      .parse(JSON.parse(res.message.content));
    yield {
      type: "observe",
      tool: "chat:structure",
      result: `summary: ${structured.summary}\n${structured.findings.length} findings`,
    };
  } catch (err) {
    yield {
      type: "error",
      message: `structuring failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 3. Pull the tag's last inspection from SQL.
  const sqlRows = retrieveSql(input.tag);
  if (sqlRows.length > 0) {
    yield {
      type: "observe",
      tool: "retrieve:sql",
      result: sqlRows.map((c) => `${c.heading}: ${c.snippet}`).join("\n"),
    };
  }

  // 4. Write the docx.
  const note: ApprovalNote = {
    title: "Equipment Inspection Approval Note",
    prepared_by: "Sovereign Workbench",
    date: new Date().toISOString().slice(0, 10),
    tag: input.tag,
    summary: structured.summary || `Inspection of ${input.tag}.`,
    findings: structured.findings.map((f) => {
      const [status, ...rest] = f.split(":");
      return {
        tag: input.tag,
        status: status?.trim() ?? "review",
        finding: (rest.join(":") || f).trim(),
      };
    }),
    recommendation: "Proceed per SOP after sign-off.",
  };
  try {
    const name = await writeApprovalNote(note);
    yield { type: "observe", tool: "docx", result: `wrote ${name}` };
  } catch (err) {
    yield {
      type: "error",
      message: `docx failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 5. Stream a short summary.
  const summaryText = `${note.tag}: ${note.summary} (${note.findings.length} findings). approval_note.docx written.`;
  for (const chunk of summaryText.split(/(\s+)/)) {
    if (signal?.aborted) return;
    if (chunk) yield { type: "token", content: chunk };
  }
  yield { type: "done" };
}
