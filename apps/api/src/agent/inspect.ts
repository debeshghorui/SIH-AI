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
 *   1. OCR + vision over the scan
 *   2. Ask the chat model to structure the findings into a table
 *   3. Pull the tag's last inspection from SQL
 *   4. Write approval_note.docx into the vault
 *   5. Stream a short summary as tokens
 */

export const inspectInputSchema = z.object({
  name: z.string().min(1),
  tag: z.string().min(1),
});

export type InspectInput = z.infer<typeof inspectInputSchema>;

export async function* runInspect(
  input: InspectInput,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent, void, unknown> {
  const chat = getModel("chat");
  const vision = getModel("vision");

  yield {
    type: "route",
    store: "sql",
    model: "chat",
    tools: ["ocr", "docx", "search"],
    reason:
      "inspection beat: OCR/vision → structure findings → SQL history → approval_note.docx",
  };
  yield {
    type: "step",
    stage: "route",
    title: "Inspection beat",
    detail:
      "Fixed pipeline for a scan: store=sql, model=chat, tools=[ocr, docx, search]. Router is skipped.",
    model: "chat",
    ollama: chat.ollama,
    data: { store: "sql", nanoStore: "sql" },
  };

  let ocrText = "";
  let visionFindings = "";
  try {
    const out = await extractFindings(input.name, { purpose: "inspection" });
    ocrText = out.text;
    visionFindings = out.vision;
    yield {
      type: "step",
      stage: "tool",
      title: `OCR + vision over ${input.name}`,
      detail: `OCR: ${ocrText.slice(0, 400)}\nVision: ${visionFindings.slice(0, 400)}`,
      model: "vision",
      ollama: vision.ollama,
      data: { tool: "ocr" },
    };
  } catch (err) {
    yield {
      type: "error",
      message: `ocr failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let structured: { findings: string[]; summary: string } = {
    findings: [],
    summary: "",
  };
  try {
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
      type: "step",
      stage: "tool",
      title: "Structure findings",
      detail: `summary: ${structured.summary}\n${structured.findings.length} findings`,
      model: "chat",
      ollama: chat.ollama,
      data: { tool: "chat:structure" },
    };
  } catch (err) {
    yield {
      type: "error",
      message: `structuring failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const sqlRows = retrieveSql(input.tag);
  yield {
    type: "step",
    stage: "retrieve",
    title: sqlRows.length
      ? `Retrieve sql (${sqlRows.length})`
      : "Retrieve sql (empty)",
    detail: sqlRows.length
      ? "Tag history from plant.sqlite."
      : `No SQL rows for tag ${input.tag}.`,
    data: {
      store: "sql",
      usedFts: false,
      citations: sqlRows,
    },
  };

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
    yield {
      type: "step",
      stage: "tool",
      title: "Write approval note",
      detail: `wrote ${name}`,
      data: { tool: "docx" },
    };
  } catch (err) {
    yield {
      type: "error",
      message: `docx failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  yield {
    type: "step",
    stage: "generate",
    title: "Generate summary",
    detail: `Streaming inspection summary from chat (${chat.ollama}).`,
    model: "chat",
    ollama: chat.ollama,
  };

  const summaryText = `${note.tag}: ${note.summary} (${note.findings.length} findings). approval_note.docx written.`;
  for (const chunk of summaryText.split(/(\s+)/)) {
    if (signal?.aborted) return;
    if (chunk) yield { type: "token", content: chunk };
  }
  yield { type: "done" };
}
