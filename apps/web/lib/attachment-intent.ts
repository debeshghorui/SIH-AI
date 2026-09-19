/**
 * Decide whether an attached file should run the inspection beat
 * (OCR → findings table → approval_note.docx) or normal chat with
 * document text injected into context.
 */
export function wantsInspectionBeat(text: string, file: File): boolean {
  const lower = text.toLowerCase();
  const inspectWords =
    /\b(inspect|inspection|findings|approval|anomal|scan beat|approval.?note|write.*docx)\b/i;
  const hasTag = /\d{2}-[a-z]{1,3}-\d{3}/i.test(text);
  const isImage = file.type.startsWith("image/");

  // Demo beat 2: image scan + tag → inspection workflow.
  if (isImage && hasTag && inspectWords.test(lower)) return true;
  if (inspectWords.test(lower) && hasTag) return true;
  if (/\b(run|start)\s+inspect/i.test(lower)) return true;

  return false;
}

/** Hide `[attachment: name]` in the bubble; the payload still keeps the chip. */
export function stripAttachmentChip(content: string): string {
  return content.replace(/\n?\[attachment:\s*[^\]]+\]\s*$/i, "").trim();
}

export function attachmentChipName(content: string): string | undefined {
  const match = content.match(/\[attachment:\s*([^\]]+)\]\s*$/i);
  const name = match?.[1]?.trim();
  return name || undefined;
}
