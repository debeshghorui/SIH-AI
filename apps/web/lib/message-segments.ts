export const RUNNABLE_LANGUAGES = [
  "html",
  "css",
  "javascript",
  "js",
  "jsx",
  "typescript",
  "ts",
  "tsx",
  "python",
  "py",
] as const;

export type RunnableLanguage = (typeof RUNNABLE_LANGUAGES)[number];

const RUNNABLE = new Set<string>(RUNNABLE_LANGUAGES);

export function isRunnableLanguage(language: string): boolean {
  return RUNNABLE.has(language.trim().toLowerCase());
}

export type MessageSegment =
  | { type: "text"; text: string }
  | { type: "code"; language: string; code: string; closed: boolean };

/**
 * Split assistant/user text on markdown fences.
 * Handles ```lang\\ncode```, same-line ```lang code```, and an unclosed fence while streaming.
 */
export function splitMessageSegments(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const fence = /```([^\n`]*)(?:\r?\n)?([\s\S]*?)(```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(content))) {
    if (match.index > last) {
      const text = content.slice(last, match.index);
      if (text) segments.push({ type: "text", text });
    }

    const header = match[1] ?? "";
    const langToken = header.trim().split(/\s+/, 1)[0] ?? "";
    const language = langToken.toLowerCase();
    const headerRest = header.trim().slice(langToken.length).trimStart();
    const rawBody = match[2] ?? "";
    const code = (headerRest ? `${headerRest}\n${rawBody}` : rawBody).replace(
      /\n$/,
      "",
    );
    const closed = match[3] === "```";

    segments.push({ type: "code", language, code, closed });
    last = match.index + match[0].length;
  }

  if (last < content.length) {
    const text = content.slice(last);
    if (text) segments.push({ type: "text", text });
  }

  return segments.length > 0 ? segments : [{ type: "text", text: content }];
}
