/**
 * Rebuild readable lines from pdf.js text items using the glyph transform
 * matrix. Joining with a single space (the old path) flattened headings and
 * tables into one run-on paragraph.
 */
export type PdfTextItem = {
  str?: string;
  transform?: ArrayLike<number>;
  width?: number;
  hasEOL?: boolean;
};

export const TEXT_LAYER_MIN = 8;

export function usableWordChars(s: string): number {
  return (s.match(/[A-Za-z0-9]{2,}/g) ?? []).join("").length;
}

export function hasUsableText(s: string): boolean {
  return usableWordChars(s) >= TEXT_LAYER_MIN;
}

/** Prefer the denser transcription when both OCR and vision return text. */
export function preferReadableText(ocr: string, vision: string): string {
  const a = ocr.trim();
  const b = vision.trim();
  const wa = usableWordChars(a);
  const wb = usableWordChars(b);
  if (wa >= TEXT_LAYER_MIN && wb >= TEXT_LAYER_MIN) {
    return wa >= wb ? a : b;
  }
  if (wa >= TEXT_LAYER_MIN) return a;
  if (wb >= TEXT_LAYER_MIN) return b;
  return a || b;
}

export function textItemsToLines(items: readonly PdfTextItem[]): string {
  const lines: string[] = [];
  let line = "";
  let lastY: number | null = null;
  let lastEndX: number | null = null;

  for (const item of items) {
    const str = item.str ?? "";
    const tr = item.transform;
    const x = tr ? Number(tr[4]) : 0;
    const y = tr ? Number(tr[5]) : 0;
    const height = tr
      ? Math.abs(Number(tr[3]) || Number(tr[0]) || 10)
      : 10;

    if (!str && !item.hasEOL) continue;

    if (lastY !== null && Math.abs(y - lastY) > height * 0.4) {
      lines.push(line.trimEnd());
      line = "";
      lastEndX = null;
    } else if (
      line &&
      lastEndX !== null &&
      x - lastEndX > height * 0.2 &&
      !line.endsWith(" ") &&
      str.length > 0 &&
      !str.startsWith(" ")
    ) {
      line += " ";
    }

    line += str;
    lastY = y;
    lastEndX = x + (item.width ?? str.length * height * 0.5);

    if (item.hasEOL) {
      lines.push(line.trimEnd());
      line = "";
      lastY = null;
      lastEndX = null;
    }
  }

  if (line.trim()) lines.push(line.trimEnd());
  return lines.join("\n").trim();
}
