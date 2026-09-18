export type TokenKind =
  | "plain"
  | "comment"
  | "keyword"
  | "string"
  | "tag"
  | "attr"
  | "number"
  | "punct";

export type HighlightToken = { text: string; kind: TokenKind };

const JS_KEYWORDS = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "async",
  "await",
  "from",
  "of",
  "as",
  "type",
  "interface",
  "enum",
  "implements",
  "private",
  "protected",
  "public",
  "readonly",
]);

const PY_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield",
]);

function push(out: HighlightToken[], text: string, kind: TokenKind) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) {
    last.text += text;
    return;
  }
  out.push({ text, kind });
}

function tokenizeMarkup(code: string): HighlightToken[] {
  const out: HighlightToken[] = [];
  const re =
    /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[A-Za-z][\w:-]*[^>]*>|[^<]+/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code))) {
    const chunk = match[0];
    if (chunk.startsWith("<!--")) {
      push(out, chunk, "comment");
      continue;
    }
    if (chunk.startsWith("<!")) {
      push(out, chunk, "keyword");
      continue;
    }
    if (chunk.startsWith("<")) {
      tokenizeTag(out, chunk);
      continue;
    }
    push(out, chunk, "plain");
  }
  return out;
}

function tokenizeTag(out: HighlightToken[], tag: string) {
  const close = tag.endsWith("/>") ? 2 : tag.endsWith(">") ? 1 : 0;
  const inner = tag.slice(1, tag.length - close);
  push(out, "<", "punct");
  const nameMatch = inner.match(/^(\/?)\s*([A-Za-z][\w:-]*)/);
  if (!nameMatch) {
    push(out, inner, "tag");
    if (close) push(out, tag.slice(-close), "punct");
    return;
  }
  if (nameMatch[1]) push(out, "/", "punct");
  push(out, nameMatch[2], "tag");
  let rest = inner.slice(nameMatch[0].length);
  const attr =
    /(\s+)([A-Za-z_:][\w:.-]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)?|(\s+)|(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = attr.exec(rest))) {
    if (m[2]) {
      push(out, m[1], "plain");
      push(out, m[2], "attr");
      push(out, m[3], "punct");
      if (m[4]) push(out, m[4], "string");
      continue;
    }
    if (m[5]) {
      push(out, m[5], "plain");
      continue;
    }
    push(out, m[6], "plain");
  }
  if (close) push(out, tag.slice(-close), "punct");
}

function tokenizeCss(code: string): HighlightToken[] {
  const out: HighlightToken[] = [];
  const re =
    /\/\*[\s\S]*?\*\/|"[^"]*"|'[^']*'|#(?:[0-9a-fA-F]{3,8})\b|-?\d[\d.]*[a-z%]*|[.#]?[A-Za-z_-][\w-]*|[^{}\s:;,]+|[{}:;,]|\s+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code))) {
    const chunk = match[0];
    if (chunk.startsWith("/*")) push(out, chunk, "comment");
    else if (chunk.startsWith('"') || chunk.startsWith("'"))
      push(out, chunk, "string");
    else if (chunk.startsWith("#") && /^#(?:[0-9a-fA-F]{3,8})$/.test(chunk))
      push(out, chunk, "number");
    else if (/^-?\d/.test(chunk)) push(out, chunk, "number");
    else if (/^[{}:;,]$/.test(chunk)) push(out, chunk, "punct");
    else if (/^\s+$/.test(chunk)) push(out, chunk, "plain");
    else if (
      /^(important|from|to|and|or|not)$/i.test(chunk) ||
      chunk.startsWith("@")
    )
      push(out, chunk, "keyword");
    else push(out, chunk, "attr");
  }
  if (!out.length) push(out, code, "plain");
  return out;
}

function tokenizeScript(code: string, python = false): HighlightToken[] {
  const out: HighlightToken[] = [];
  const keywords = python ? PY_KEYWORDS : JS_KEYWORDS;
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (python && ch === "#") {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push(out, code.slice(i, stop), "comment");
      i = stop;
      continue;
    }
    if (!python && ch === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push(out, code.slice(i, stop), "comment");
      i = stop;
      continue;
    }
    if (!python && ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end === -1 ? code.length : end + 2;
      push(out, code.slice(i, stop), "comment");
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || (!python && ch === "`")) {
      const quote = ch;
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      push(out, code.slice(i, j), "string");
      i = j;
      continue;
    }
    if (python && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
      const q = code.slice(i, i + 3);
      const end = code.indexOf(q, i + 3);
      const stop = end === -1 ? code.length : end + 3;
      push(out, code.slice(i, stop), "string");
      i = stop;
      continue;
    }
    if (/\d/.test(ch)) {
      let j = i;
      while (j < code.length && /[\d._xXa-fA-F]/.test(code[j])) j += 1;
      push(out, code.slice(i, j), "number");
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < code.length && /[\w$]/.test(code[j])) j += 1;
      const word = code.slice(i, j);
      push(out, word, keywords.has(word) ? "keyword" : "plain");
      i = j;
      continue;
    }
    if (/\s/.test(ch)) {
      let j = i;
      while (j < code.length && /\s/.test(code[j])) j += 1;
      push(out, code.slice(i, j), "plain");
      i = j;
      continue;
    }
    push(out, ch, "punct");
    i += 1;
  }
  return out;
}

function tokenizeJson(code: string): HighlightToken[] {
  const out: HighlightToken[] = [];
  const re =
    /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\]:,]|\s+|./g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code))) {
    const chunk = match[0];
    if (chunk.startsWith('"')) push(out, chunk, "string");
    else if (/^-?\d/.test(chunk)) push(out, chunk, "number");
    else if (/^(true|false|null)$/.test(chunk)) push(out, chunk, "keyword");
    else if (/^[{}\[\]:,]$/.test(chunk)) push(out, chunk, "punct");
    else push(out, chunk, "plain");
  }
  return out;
}

function family(language: string): "html" | "css" | "js" | "py" | "json" | "plain" {
  const lang = language.trim().toLowerCase();
  if (lang === "html" || lang === "xml" || lang === "svg") return "html";
  if (lang === "css" || lang === "scss") return "css";
  if (
    lang === "js" ||
    lang === "javascript" ||
    lang === "jsx" ||
    lang === "ts" ||
    lang === "tsx" ||
    lang === "typescript"
  )
    return "js";
  if (lang === "py" || lang === "python") return "py";
  if (lang === "json") return "json";
  return "plain";
}

export function highlightCode(code: string, language: string): HighlightToken[] {
  switch (family(language)) {
    case "html":
      return tokenizeMarkup(code);
    case "css":
      return tokenizeCss(code);
    case "js":
      return tokenizeScript(code, false);
    case "py":
      return tokenizeScript(code, true);
    case "json":
      return tokenizeJson(code);
    default:
      return [{ text: code, kind: "plain" }];
  }
}

export function tokensToLines(tokens: HighlightToken[]): HighlightToken[][] {
  const lines: HighlightToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: token.kind });
    });
  }
  return lines;
}
