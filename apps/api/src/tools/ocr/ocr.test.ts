import { describe, expect, test } from "bun:test";
import { textItemsToLines, preferReadableText } from "./text";
import { extractPdfBuffer } from "./index";
import { sanitizeVaultName, safeVaultRelative } from "../fs";

describe("sanitizeVaultName", () => {
  test("collapses duplicate .pdf extensions on upload", () => {
    expect(sanitizeVaultName("A1_debesh_1018.pdf.pdf")).toBe(
      "A1_debesh_1018.pdf",
    );
  });

  test("keeps a listed double extension for reads", () => {
    expect(safeVaultRelative("A1_debesh_1018.pdf.pdf")).toBe(
      "A1_debesh_1018.pdf.pdf",
    );
  });

  test("keeps a normal artifact name", () => {
    expect(sanitizeVaultName("approval_note.docx")).toBe("approval_note.docx");
  });

  test("rejects parent segments", () => {
    expect(() => sanitizeVaultName("../secret")).toThrow(/escapes vault/);
  });
});

describe("textItemsToLines", () => {
  test("starts a new line when y jumps", () => {
    const text = textItemsToLines([
      { str: "Title", transform: [12, 0, 0, 12, 72, 720], width: 40 },
      { str: "Body", transform: [12, 0, 0, 12, 72, 700], width: 36 },
    ]);
    expect(text).toBe("Title\nBody");
  });

  test("inserts a space between same-line runs with a gap", () => {
    const text = textItemsToLines([
      { str: "Hello", transform: [12, 0, 0, 12, 72, 700], width: 40 },
      { str: "world", transform: [12, 0, 0, 12, 130, 700], width: 40 },
    ]);
    expect(text).toBe("Hello world");
  });

  test("honors hasEOL", () => {
    const text = textItemsToLines([
      { str: "One", transform: [10, 0, 0, 10, 0, 10], width: 20, hasEOL: true },
      { str: "Two", transform: [10, 0, 0, 10, 0, 10], width: 20 },
    ]);
    expect(text).toBe("One\nTwo");
  });
});

describe("preferReadableText", () => {
  test("picks the denser transcription", () => {
    expect(
      preferReadableText("Title only.", "Title\n1. Step one\n2. Step two\n3. Step three"),
    ).toContain("Step two");
  });

  test("falls back to OCR when vision is empty", () => {
    expect(preferReadableText("Certificate of Completion GENAI", "")).toContain(
      "GENAI",
    );
  });
});

function buildSimplePdf(pages: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let offset = 0;

  function add(s: string) {
    const bytes = encoder.encode(s);
    chunks.push(bytes);
    offset += bytes.length;
  }

  function addObj(body: string) {
    offsets.push(offset);
    add(body);
  }

  add("%PDF-1.4\n");
  addObj("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");

  const pageIds = pages.map((_, i) => 3 + i);
  const contentIds = pages.map((_, i) => 3 + pages.length + i);
  const fontId = 3 + pages.length * 2;

  addObj(
    `2 0 obj << /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >> endobj\n`,
  );

  for (let i = 0; i < pages.length; i++) {
    addObj(
      `${pageIds[i]} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >> endobj\n`,
    );
  }

  for (let i = 0; i < pages.length; i++) {
    const stream = `BT /F1 24 Tf 72 720 Td (${pages[i]}) Tj ET\n`;
    addObj(
      `${contentIds[i]} 0 obj << /Length ${stream.length} >> stream\n${stream}endstream\nendobj\n`,
    );
  }

  addObj(
    `${fontId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`,
  );

  const xrefAt = offset;
  add(`xref\n0 ${offsets.length}\n`);
  add("0000000000 65535 f \n");
  for (let i = 1; i < offsets.length; i++) {
    add(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  add(
    `trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`,
  );

  const out = new Uint8Array(offset);
  let cursor = 0;
  for (const part of chunks) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

describe("extractPdfBuffer", () => {
  test("reads every page and keeps page markers", async () => {
    const buf = buildSimplePdf(["Alpha heading", "Beta heading"]);
    const result = await extractPdfBuffer(buf, "document");
    expect(result.pages).toBe(2);
    expect(result.text).toContain("--- page 1 ---");
    expect(result.text).toContain("--- page 2 ---");
    expect(result.text).toContain("Alpha heading");
    expect(result.text).toContain("Beta heading");
    expect(result.methods.length).toBeGreaterThan(0);
  });
});
