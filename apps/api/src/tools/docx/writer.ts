import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
} from "docx";
import { z } from "zod";
import { vaultWrite } from "../fs";

/**
 * Approval note writer (D7). 7B models ramble, so the agent fills slots in
 * a fixed template instead of free-form generating a document. The
 * artifact name is always `approval_note.docx`.
 */

export const findingSchema = z.object({
  tag: z.string(),
  status: z.string(),
  finding: z.string(),
  inspected_at: z.string().optional(),
  inspector: z.string().optional(),
});

export const approvalNoteSchema = z.object({
  title: z.string().default("Equipment Inspection Approval Note"),
  prepared_by: z.string().default("Sovereign Workbench"),
  date: z.string().default(new Date().toISOString().slice(0, 10)),
  tag: z.string(),
  summary: z.string(),
  findings: z.array(findingSchema).default([]),
  recommendation: z.string().default("Proceed per SOP after sign-off."),
});

export type ApprovalNote = z.infer<typeof approvalNoteSchema>;

export async function writeApprovalNote(
  note: ApprovalNote,
): Promise<string> {
  const parsed = approvalNoteSchema.parse(note);

  const headerCell = (text: string) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: true })],
        }),
      ],
      shading: { fill: "E2E8F0" },
    });

  const bodyCell = (text: string) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun(text)] })],
    });

  const findingsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Tag"),
          headerCell("Status"),
          headerCell("Finding"),
          headerCell("Inspector"),
        ],
      }),
      ...parsed.findings.map(
        (f) =>
          new TableRow({
            children: [
              bodyCell(f.tag),
              bodyCell(f.status),
              bodyCell(f.finding),
              bodyCell(f.inspector ?? ""),
            ],
          }),
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: parsed.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Tag: ", bold: true }),
              new TextRun(parsed.tag),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Prepared by: ", bold: true }),
              new TextRun(parsed.prepared_by),
              new TextRun({ text: "    Date: ", bold: true }),
              new TextRun(parsed.date),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            text: "Summary",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph(parsed.summary),
          new Paragraph({ text: "" }),
          new Paragraph({
            text: "Findings",
            heading: HeadingLevel.HEADING_2,
          }),
          parsed.findings.length > 0 ? findingsTable : new Paragraph("No findings recorded."),
          new Paragraph({ text: "" }),
          new Paragraph({
            text: "Recommendation",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph(parsed.recommendation),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({ text: "Sign-off: ____________________", bold: true }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const name = "approval_note.docx";
  vaultWrite(name, buffer as unknown as string);
  return name;
}
