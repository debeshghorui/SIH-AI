import {
  deleteProjectFile,
  hasProjectFile,
  listTree,
  projectSnapshot,
  readProjectFile,
  writeProjectFile,
} from "../tools/project";

export type ExtractedFile = { path: string; content: string };

const FENCE = /```([^\n`]*)(?:\r?\n)?([\s\S]*?)```/g;

const UNNAMED: Record<string, string> = {
  html: "index.html",
  css: "styles.css",
  javascript: "main.js",
  js: "main.js",
  jsx: "main.js",
  typescript: "main.ts",
  ts: "main.ts",
  tsx: "main.ts",
  python: "main.py",
  py: "main.py",
};

const CODE_INTENT =
  /\b(html|css|javascript|\bjs\b|typescript|\bts\b|python|\bpy\b|code|script|web\s*page|web\s*site|sandbox|parselevels?)\b/i;
const CODE_VERB =
  /\b(write|writ|creates?|creat|generate|genrate|generete|genarate|generat\w*|build|make|fix|edit|modify|refactor|run|preview)\b/i;
const FILE_ASK =
  /\b((an?|the)\s+)?(html|css|javascript|js|typescript|ts|python|py)\s+files?\b/i;
const SCAFFOLD_ASK = /\b(react|npm|npx|vite|create-react-app|pip install)\b/i;
const PROJECT_FOLLOWUP =
  /\b((in|into|to)\s+(the\s+)?project|run\s+it|run\s+this|preview(\s+it)?|you have to run|need (it )?in (the )?project)\b/i;

export function looksLikeCodeRequest(query: string): boolean {
  if (SCAFFOLD_ASK.test(query)) return true;
  if (FILE_ASK.test(query)) return true;
  if (CODE_INTENT.test(query) && CODE_VERB.test(query)) return true;
  if (/\.(html|css|js|ts|py)\b/i.test(query) && CODE_VERB.test(query)) {
    return true;
  }
  return false;
}

export function isCodingTurn(
  query: string,
  preferModel?: string,
  routedModel?: string,
  extra?: { priorCoding?: boolean; hasProject?: boolean },
): boolean {
  if (preferModel === "coder" || routedModel === "coder") return true;
  if (looksLikeCodeRequest(query)) return true;
  if (
    (extra?.priorCoding || extra?.hasProject) &&
    PROJECT_FOLLOWUP.test(query)
  ) {
    return true;
  }
  return false;
}

export function conversationHasProject(conversationId?: string): boolean {
  if (!conversationId) return false;
  try {
    return listTree(conversationId).length > 0;
  } catch {
    return false;
  }
}

export function hasRunnableFences(markdown: string): boolean {
  return extractCodeFiles(markdown, { allowUnnamed: true }).length > 0;
}

function looksLikeFilename(token: string): boolean {
  return /^[\w./-]+\.[A-Za-z0-9]+$/.test(token) && !token.startsWith(".");
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function langExts(lang: string): string[] | null {
  const key = lang.toLowerCase();
  if (key === "python" || key === "py") return ["py"];
  if (key === "html") return ["html"];
  if (key === "css") return ["css"];
  if (key === "javascript" || key === "js" || key === "jsx") return ["js", "mjs", "jsx"];
  if (key === "typescript" || key === "ts" || key === "tsx") return ["ts", "mts", "tsx"];
  if (key === "json") return ["json"];
  if (key === "md" || key === "markdown") return ["md"];
  return null;
}

function filenameFitsLang(name: string, lang: string): boolean {
  const exts = langExts(lang);
  if (!exts) return looksLikeFilename(name);
  return exts.includes(extOf(name));
}

/** First line is `app.py`, `# app.py`, or `<!-- index.html -->`. */
export function peelFilename(
  lang: string,
  body: string,
): { path: string | null; content: string } {
  const lines = body.split(/\r?\n/);
  const first = (lines[0] ?? "").trim();
  if (!first) return { path: null, content: body };

  let name: string | null = null;
  if (looksLikeFilename(first) && filenameFitsLang(first, lang)) {
    name = first;
  } else {
    const comment =
      first.match(/^(?:#|\/\/)\s*(?:file(?:name)?:?\s*)?([\w./-]+\.[A-Za-z0-9]+)\s*$/i) ??
      first.match(/^<!--\s*([\w./-]+\.[A-Za-z0-9]+)\s*-->$/);
    const token = comment?.[1];
    if (token && looksLikeFilename(token) && filenameFitsLang(token, lang)) {
      name = token;
    }
  }
  if (!name) return { path: null, content: body };
  const rest = lines.slice(1).join("\n").replace(/^\n/, "");
  return { path: name.replace(/\\/g, "/"), content: rest };
}

export function extractCodeFiles(
  markdown: string,
  opts: { allowUnnamed?: boolean } = {},
): ExtractedFile[] {
  const allowUnnamed = opts.allowUnnamed ?? false;
  const usedUnnamed = new Set<string>();
  const byPath = new Map<string, string>();
  const pendingName = new Map<string, string>();
  const fence = new RegExp(FENCE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown))) {
    const header = (match[1] ?? "").trim();
    const rawBody = (match[2] ?? "").replace(/\n$/, "");
    const tokens = header.split(/\s+/).filter(Boolean);
    let filePath: string | null = null;
    let lang = "";
    for (const token of tokens) {
      if (looksLikeFilename(token)) {
        filePath = token.replace(/\\/g, "/");
        break;
      }
    }
    if (tokens[0] && !looksLikeFilename(tokens[0])) {
      lang = tokens[0].toLowerCase();
    }
    const peeled = peelFilename(lang, rawBody);
    let body = peeled.content;
    if (!filePath && peeled.path) filePath = peeled.path;

    if (filePath && !body.trim()) {
      if (lang) pendingName.set(lang, filePath);
      continue;
    }
    if (!filePath && lang && pendingName.has(lang)) {
      filePath = pendingName.get(lang) ?? null;
      pendingName.delete(lang);
    }
    if (!filePath && allowUnnamed && lang && UNNAMED[lang]) {
      const fallback = UNNAMED[lang];
      if (!usedUnnamed.has(fallback) && !byPath.has(fallback)) {
        filePath = fallback;
        usedUnnamed.add(fallback);
      }
    }
    if (!filePath || !body.trim()) continue;
    const rel = filePath.replace(/^(\.\/)+/, "").replace(/\\/g, "/");
    if (!rel || rel.includes("..") || rel.startsWith("/") || rel.includes("\\")) {
      continue;
    }
    byPath.set(rel, body);
  }
  return [...byPath.entries()].map(([p, content]) => ({ path: p, content }));
}

export function ensureHtmlLinksCss(files: ExtractedFile[]): ExtractedFile[] {
  const htmlIndex = files.findIndex(
    (f) => f.path === "index.html" || f.path.endsWith("/index.html"),
  );
  const css = files.find(
    (f) => f.path === "styles.css" || f.path.endsWith("/styles.css"),
  );
  if (htmlIndex < 0 || !css) return files;
  const html = files[htmlIndex];
  if (!html) return files;
  if (/<link\b[^>]*rel=["']?stylesheet/i.test(html.content)) return files;
  const href = css.path.split("/").pop() ?? "styles.css";
  let next = html.content;
  if (/<\/head>/i.test(next)) {
    next = next.replace(
      /<\/head>/i,
      `  <link rel="stylesheet" href="${href}">\n</head>`,
    );
  } else if (/<html[\s>]/i.test(next)) {
    next = next.replace(
      /<html([^>]*)>/i,
      `<html$1>\n<head>\n  <link rel="stylesheet" href="${href}">\n</head>`,
    );
  } else {
    next = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<link rel="stylesheet" href="${href}">\n</head>\n<body>\n${next}\n</body>\n</html>`;
  }
  return files.map((f, i) => (i === htmlIndex ? { ...f, content: next } : f));
}

export function codingSystemPrompt(projectFiles: string): string {
  return [
    "You are a file-writing coding assistant on a sovereign air-gapped workbench.",
    "Write the files the user asked for in this reply. HTML, CSS, JavaScript, TypeScript, and Python are allowed and expected. Never refuse those. Never say you will not generate a file. Never give an example for the user to copy by hand — emit the files yourself.",
    "One fence per file. The opening line is the language and the filename, then the full body:",
    "```html index.html\n<!DOCTYPE html>\n<html><body><h1>Hello, World!</h1></body></html>\n```",
    "Never emit a fence whose body is only a filename.",
    "index.html must link local CSS/JS with relative href/src (no CDN).",
    "Do not scaffold React, npm, npx, Vite, CRA, or pip — those are unavailable here. If the user asks for them, say so in one sentence, then still write equivalent HTML+CSS+JS or Python files.",
    "When the user asks to change something, rewrite the affected files in full. Keep filenames stable.",
    "If an earlier reply in this chat refused, ignore it and write the files now.",
    "You do not start Docker. After writing, tell the user to click Preview (HTML/CSS) or Run (JS/Python) in Project studio.",
    projectFiles
      ? `Existing project files (edit these; do not invent a parallel copy):\n${projectFiles}`
      : "There is no project yet. Create the files the user asked for.",
  ].join("\n\n");
}

export function materializeProject(
  conversationId: string,
  markdown: string,
  opts: { allowUnnamed?: boolean } = {},
): string[] {
  const extracted = extractCodeFiles(markdown, opts);
  if (extracted.length === 0) return [];

  const files = [...extracted];
  const hasCssInBatch = files.some((f) => f.path === "styles.css");
  if (
    files.some((f) => f.path === "index.html") &&
    !hasCssInBatch &&
    hasProjectFile(conversationId, "styles.css")
  ) {
    files.push({ path: "styles.css", content: "/* existing */" });
  }
  const linked = ensureHtmlLinksCss(files);
  const skipDummyCss = !hasCssInBatch;
  const written: string[] = [];
  for (const file of linked) {
    if (skipDummyCss && file.path === "styles.css" && file.content === "/* existing */") {
      continue;
    }
    try {
      written.push(writeProjectFile(conversationId, file.path, file.content));
    } catch {
      // illegal path, quota, or empty
    }
  }
  dropFilenameStubs(conversationId, written);
  return [...new Set(written)];
}

/** `main.py` whose whole body is `app.py` after the real file was written. */
function dropFilenameStubs(conversationId: string, written: string[]): void {
  if (written.length === 0) return;
  for (const file of listTree(conversationId)) {
    if (written.includes(file.path)) continue;
    let body = "";
    try {
      body = readProjectFile(conversationId, file.path).trim();
    } catch {
      continue;
    }
    if (
      looksLikeFilename(body) &&
      (written.includes(body) || hasProjectFile(conversationId, body))
    ) {
      try {
        deleteProjectFile(conversationId, file.path);
      } catch {
        // ignore
      }
    }
  }
}

export function existingProjectPrompt(conversationId?: string): string {
  if (!conversationId) return "";
  try {
    if (listTree(conversationId).length === 0) return "";
    return projectSnapshot(conversationId);
  } catch {
    return "";
  }
}
