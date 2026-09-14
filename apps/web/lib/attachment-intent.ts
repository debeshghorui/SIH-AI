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
