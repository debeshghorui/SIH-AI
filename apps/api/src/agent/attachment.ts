/**
 * Sticky attachment: follow-ups like "what's in this pic" reuse the last
 * vault file from chat history instead of querying plant SOP stores.
 * Image bytes are never stored in messages — only `[attachment: name]`.
 */

const CHIP = /\[attachment:\s*([^\]]+)\]/gi;

const FILE_REF =
  /\b(pics?|pictures?|images?|photos?|scans?|files?|documents?|pdfs?|attachments?|certificates?|jpegs?|jpgs?|pngs?)\b/i;

const ABOUT_FILE =
  /\b(what\s+you\s+can\s+see|what\s+can\s+you\s+see|what\s+do\s+you\s+see|what'?s\s+in|what\s+is\s+in|describe\s+(it|this|that)|tell\s+me\s+more|summaris[ea]|summarize|transcribe|image\s+text|image\s+content|give\s+(?:me\s+)?(?:the\s+)?(?:text|content))\b/i;

const PLANT_TOPIC =
  /\b(sop|isolation|permit to work|lockout|tagout|\d{2}-[a-z]{1,3}-\d{3})\b/i;

export function lastAttachmentFromMessages(
  messages: readonly { content?: string }[],
): string | undefined {
  let found: string | undefined;
  for (const message of messages) {
    const content = message.content ?? "";
    CHIP.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CHIP.exec(content))) {
      const name = match[1]?.trim();
      if (name) found = name;
    }
  }
  return found;
}

/** True when the question is about the previously attached file, not plant RAG. */
export function refersToAttachment(query: string): boolean {
  const q = query.replace(/\n?\[attachment:\s*[^\]]+\]\s*$/i, "").trim();
  if (!q) return false;
  if (FILE_REF.test(q)) return true;
  if (ABOUT_FILE.test(q) && !PLANT_TOPIC.test(q)) return true;
  return false;
}

export function resolveStickyAttachment(input: {
  query: string;
  messages: readonly { content?: string }[];
  attachmentName?: string;
}): { attachmentName?: string; sticky: boolean } {
  const uploaded = input.attachmentName?.trim();
  if (uploaded) return { attachmentName: uploaded, sticky: false };
  if (!refersToAttachment(input.query)) return { sticky: false };
  const fromHistory = lastAttachmentFromMessages(input.messages);
  if (!fromHistory) return { sticky: false };
  return { attachmentName: fromHistory, sticky: true };
}

/** Cached vision captions that only captured a title are this short. */
export const THIN_EXTRACT_CHARS = 200;

export function isThinExtract(text: string): boolean {
  return text.trim().length < THIN_EXTRACT_CHARS;
}

/** User asked to dump the file text, not a paraphrase. */
export function wantsVerbatimExtract(query: string): boolean {
  const q = query.replace(/\n?\[attachment:\s*[^\]]+\]\s*$/i, "").trim();
  return /\b(text|content|transcribe|ocr|verbatim|exact(?:\s+words)?|every\s+word)\b/i.test(
    q,
  );
}
