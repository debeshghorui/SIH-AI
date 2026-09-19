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
  | {
      type: "code";
      language: string;
      code: string;
      closed: boolean;
      filename?: string;
    };

function looksLikeFilename(token: string): boolean {
  return /^[\w./-]+\.[A-Za-z0-9]+$/.test(token) && !token.startsWith(".");
}

function mergeFilenameFences(segments: MessageSegment[]): MessageSegment[] {
  const out: MessageSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (
      seg.type === "text" &&
      !seg.text.trim() &&
      prev?.type === "code" &&
      !prev.code.trim() &&
      prev.filename
    ) {
      continue;
    }
    if (
      seg.type === "code" &&
      prev?.type === "code" &&
      !prev.code.trim() &&
      prev.filename
    ) {
      out[out.length - 1] = {
        type: "code",
        language: seg.language || prev.language,
        code: seg.code,
        closed: seg.closed,
        filename: seg.filename ?? prev.filename,
      };
      continue;
    }
    out.push(seg);
  }
  return out.filter((s) =>
    s.type === "text" ? Boolean(s.text.trim()) : Boolean(s.code.trim()),
  );
}

/**
 * Split assistant/user text on markdown fences.
 * Handles ```lang\\ncode```, ```lang filename```, same-line ```lang code```,
 * and an unclosed fence while streaming.
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

    const tokens = (match[1] ?? "").trim().split(/\s+/).filter(Boolean);
    let language = "";
    let filename: string | undefined;
    const inline: string[] = [];
    for (const token of tokens) {
      if (!language && !looksLikeFilename(token)) {
        language = token.toLowerCase();
        continue;
      }
      if (!filename && looksLikeFilename(token)) {
        filename = token.replace(/\\/g, "/");
        continue;
      }
      inline.push(token);
    }
    const rawBody = match[2] ?? "";
    let code = [inline.join(" "), rawBody]
      .filter((part) => part.length > 0)
      .join("\n")
      .replace(/\n$/, "");
    if (!filename && looksLikeFilename(code.trim())) {
      filename = code.trim();
      code = "";
    }
    const closed = match[3] === "```";
    segments.push({
      type: "code",
      language,
      code,
      closed,
      ...(filename ? { filename } : {}),
    });
    last = match.index + match[0].length;
  }

  if (last < content.length) {
    const text = content.slice(last);
    if (text) segments.push({ type: "text", text });
  }

  const merged = mergeFilenameFences(segments);
  return merged.length > 0 ? merged : [{ type: "text", text: content }];
}
