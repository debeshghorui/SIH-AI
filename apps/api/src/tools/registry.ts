import { z } from "zod";
import { retrieve } from "../retrieve/retrieve";
import { vaultList } from "./fs";
import { extractFindings } from "./ocr";
import { writeApprovalNote, type ApprovalNote } from "./docx/writer";
import {
  isPreviewLanguage,
  normalizeLanguage,
  runHtmlPreview,
  runSandbox,
  type SandboxResult,
} from "./sandbox";

/**
 * Tool registry. Each tool has a name, an input schema, and a handler.
 * The router may name `sandbox`; the ReAct loop does not call it. Studio
 * runs project files via POST /sandbox. OCR/fs/docx/search are used by
 * the inspect/chat paths.
 */

export const toolInputSchema = z.object({
  query: z.string().min(1),
  store: z.enum(["sql", "vector", "files", "none"]).default("vector"),
});

export type ToolInput = z.infer<typeof toolInputSchema>;

export interface Tool {
  name: string;
  description: string;
  input: z.ZodType;
  run: (input: unknown) => Promise<string>;
}

export const tools: Record<string, Tool> = {
  search: {
    name: "search",
    description: "Retrieve plant knowledge: SOPs (vector), tag/inspection data (sql), or vault files.",
    input: toolInputSchema,
    async run(raw) {
      const parsed = toolInputSchema.parse(raw);
      const { citations } = await retrieve(parsed.query, parsed.store);
      if (citations.length === 0) return "no results";
      return citations
        .map((c, i) => `(${i + 1}) [${c.kind}] ${c.source} — ${c.snippet.slice(0, 200)}`)
        .join("\n");
    },
  },
  fs: {
    name: "fs",
    description: "List files in the vault.",
    input: z.object({ subdir: z.string().default("") }),
    async run(raw) {
      const parsed = z.object({ subdir: z.string().default("") }).parse(raw);
      const items = vaultList(parsed.subdir);
      return items.length === 0
        ? "vault empty"
        : items.map((f) => `${f.name} (${f.size}B)`).join("\n");
    },
  },
  ocr: {
    name: "ocr",
    description: "Extract text and findings from a scanned PDF or image in the vault (tesseract + qwen2.5vl vision).",
    input: z.object({ name: z.string() }),
    async run(raw) {
      const parsed = z.object({ name: z.string() }).parse(raw);
      const { text, vision } = await extractFindings(parsed.name, {
        purpose: "document",
      });
      return `OCR text:\n${text.slice(0, 800)}\n\nVision findings:\n${vision.slice(0, 800)}`;
    },
  },
  sandbox: {
    name: "sandbox",
    description:
      "Run JS/TS/Python in an isolated Docker container (--network=none), or preview HTML/CSS via nginx on 127.0.0.1.",
    input: z.object({
      code: z.string(),
      tests: z.string().optional(),
      language: z.string().optional(),
    }),
    async run(raw) {
      const parsed = z
        .object({
          code: z.string(),
          tests: z.string().optional(),
          language: z.string().optional(),
        })
        .parse(raw);
      const lang = normalizeLanguage(parsed.language ?? "js");
      if (!lang) return `unsupported-language: ${parsed.language}`;
      if (isPreviewLanguage(lang)) {
        const preview = await runHtmlPreview({
          code: parsed.code,
          language: lang,
        });
        return preview.ok
          ? `preview ${preview.previewUrl} expires ${preview.expiresAt}`
          : `preview failed: ${preview.stderr}`;
      }
      const result: SandboxResult = await runSandbox({
        code: parsed.code,
        tests: parsed.tests,
        language: lang === "python" ? "python" : lang === "ts" ? "ts" : "js",
      });
      return `exit=${result.exitCode} ok=${result.ok}\nstdout:\n${result.stdout.slice(0, 800)}\nstderr:\n${result.stderr.slice(0, 400)}`;
    },
  },
  docx: {
    name: "docx",
    description: "Write an approval_note.docx from a summary + findings list.",
    input: z.object({
      tag: z.string(),
      summary: z.string(),
      findings: z.array(z.string()),
      recommendation: z.string().optional(),
    }),
    async run(raw) {
      const parsed = z
        .object({
          tag: z.string(),
          summary: z.string(),
          findings: z.array(z.string()),
          recommendation: z.string().optional(),
        })
        .parse(raw);
      const note: ApprovalNote = {
        title: "Equipment Inspection Approval Note",
        prepared_by: "Sovereign Workbench",
        date: new Date().toISOString().slice(0, 10),
        tag: parsed.tag,
        summary: parsed.summary,
        findings: parsed.findings.map((f) => {
          // Findings may arrive as "status: finding" free text; split loosely.
          const [status, ...rest] = f.split(":");
          return {
            tag: parsed.tag,
            status: status?.trim() ?? "review",
            finding: (rest.join(":") || f).trim(),
          };
        }),
        recommendation: parsed.recommendation ?? "Proceed per SOP after sign-off.",
      };
      const name = await writeApprovalNote(note);
      return `wrote ${name}`;
    },
  },
};

export function getTool(name: string): Tool | undefined {
  return tools[name];
}

export function listToolNames(): string[] {
  return Object.keys(tools);
}
