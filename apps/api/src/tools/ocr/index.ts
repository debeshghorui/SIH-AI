import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vaultRead, resolveVaultPath } from "../fs";
import { ollama } from "../../models/client";
import { getModel } from "../../models/registry";
import {
  hasUsableText,
  preferReadableText,
  textItemsToLines,
  TEXT_LAYER_MIN,
  type PdfTextItem,
} from "./text";

/**
 * OCR + vision tool.
 *   - PDF: every page's text layer (with line breaks). Image-only pages are
 *     rasterized via @napi-rs/canvas, then tesseract, then the vision model.
 *   - Image: tesseract first; vision (`qwen2.5vl:3b`) if OCR is empty or thin.
 *
 * Tesseract is local WASM; vision goes through the air-gap-wrapped Ollama client.
 */

export type ExtractPurpose = "document" | "inspection";

export type ExtractResult = {
  text: string;
  vision: string;
  pages: number;
  methods: string[];
};

const MAX_PAGES = 40;
const MAX_VISION_PAGES = 10;
const RASTER_MAX_EDGE = 1280;
const THIN_OCR_CHARS = 200;

const DOCUMENT_PROMPT =
  "OCR this page. Output every visible word, heading, and list item in reading order as markdown. Do not summarize. Do not omit numbered steps. If a line is unreadable write [illegible]. Do not invent text that is not visible.";

const INSPECTION_PROMPT =
  "This is a plant inspection scan or P&ID. List every finding, gauge reading, tag, and anomaly as a short bulleted list.";

function vendorDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../../../../");
  return path.join(root, "vendor");
}

function promptFor(purpose: ExtractPurpose): string {
  return purpose === "inspection" ? INSPECTION_PROMPT : DOCUMENT_PROMPT;
}

async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function extractWithTesseract(buf: Uint8Array, _mime: string): Promise<string> {
  // tesseract.js may try a CDN for WASM on first use. Air-gap blocks that
  // fetch; wrap init in a timeout and fall through to vision.
  const fallback = "";
  try {
    const { createWorker } = await import("tesseract.js");
    const langPath = vendorDir();
    const worker = await withTimeout(
      createWorker("eng", 1, { langPath, cacheMethod: "none" }),
      15_000,
      () => null as never,
    );
    if (!worker) return fallback;
    try {
      const { data } = await withTimeout(
        worker.recognize(Buffer.from(buf) as unknown as string),
        30_000,
        () => ({ data: { text: "" } }) as never,
      );
      return (data as { text: string }).text.trim();
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.warn(
      `tesseract unavailable (air-gap or missing vendor data): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return fallback;
  }
}

async function rasterizePage(page: {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: Record<string, unknown>) => { promise: Promise<unknown> };
}): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, RASTER_MAX_EDGE / Math.max(base.width, base.height, 1));
    const viewport = page.getViewport({ scale: Math.max(scale, 0.5) });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;
    return canvas.toBuffer("image/png");
  } catch (err) {
    console.warn(
      `pdf rasterize failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Extract every page of a PDF. Text-layer pages keep their layout; scanned
 * pages go through tesseract then the vision model. Never sends raw PDF
 * bytes to Ollama (vision only accepts images).
 */
export async function extractPdfBuffer(
  buf: Uint8Array,
  purpose: ExtractPurpose = "document",
): Promise<ExtractResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = Uint8Array.from(buf);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    useWasm: false,
    verbosity: 0,
  }).promise;

  const total = doc.numPages;
  const n = Math.min(total, MAX_PAGES);
  const parts: string[] = [];
  const methods: string[] = [];
  let visionPages = 0;

  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    let pageText = textItemsToLines(textContent.items as PdfTextItem[]);
    let method = hasUsableText(pageText) ? "text" : "empty";

    if (!hasUsableText(pageText)) {
      const png = await rasterizePage(page);
      if (png) {
        const ocr = await extractWithTesseract(png, "image/png");
        if (hasUsableText(ocr)) {
          pageText = ocr;
          method = "ocr";
        } else if (visionPages < MAX_VISION_PAGES) {
          try {
            const caption = await describeImage(png, "image/png", promptFor(purpose));
            pageText = caption || ocr || pageText;
            method = caption ? "vision" : ocr ? "ocr" : method;
            visionPages += 1;
          } catch {
            pageText = ocr || pageText;
            method = ocr ? "ocr" : method;
          }
        } else {
          pageText =
            ocr ||
            `[page ${i} skipped: scanned-page vision cap of ${MAX_VISION_PAGES}]`;
          method = ocr ? "ocr" : "skipped";
        }
      }
    }

    if (method !== "empty") methods.push(method);
    parts.push(`--- page ${i} ---\n${pageText}`.trim());
    page.cleanup();
  }

  if (typeof doc.destroy === "function") {
    await doc.destroy();
  }

  if (total > MAX_PAGES) {
    parts.push(`[pages ${MAX_PAGES + 1}–${total} omitted: page cap]`);
  }

  return {
    text: parts.join("\n\n").trim(),
    vision: "",
    pages: n,
    methods: [...new Set(methods)],
  };
}

/**
 * Ask the vision model to describe an image. `buf` is the raw image bytes;
 * `mime` is the image mime type. The Ollama chat call accepts base64 images.
 */
export async function describeImage(
  buf: Uint8Array,
  mime: string,
  prompt: string,
): Promise<string> {
  const vision = getModel("vision");
  const base64 = Buffer.from(buf).toString("base64");
  const res = await ollama().chat({
    model: vision.ollama,
    stream: false,
    messages: [
      {
        role: "user",
        content: prompt,
        images: [base64],
      },
    ],
  });
  void mime;
  return res.message.content.trim();
}

/**
 * Extract text from a vault PDF or image. Chat uses `purpose: "document"`
 * (faithful transcription). The inspection beat uses `purpose: "inspection"`.
 */
export async function extractFindings(
  vaultName: string,
  opts: { purpose?: ExtractPurpose } = {},
): Promise<ExtractResult> {
  const purpose = opts.purpose ?? "document";
  const full = resolveVaultPath(vaultName);
  const buf = await readFile(full);
  const ext = path.extname(vaultName).toLowerCase();

  if (ext === ".pdf") {
    return extractPdfBuffer(buf, purpose);
  }

  const mime =
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const ocr = await extractWithTesseract(buf, mime);
  const ocrOk = hasUsableText(ocr) && ocr.length >= THIN_OCR_CHARS;
  let vision = "";
  if (purpose === "inspection" || !ocrOk) {
    try {
      vision = await describeImage(buf, mime, promptFor(purpose));
    } catch (err) {
      vision = `vision unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  const methods: string[] = [];
  if (hasUsableText(ocr)) methods.push("ocr");
  if (hasUsableText(vision) && !vision.startsWith("vision unavailable")) {
    methods.push("vision");
  }

  if (purpose === "inspection") {
    return { text: ocr, vision, pages: 1, methods };
  }

  return {
    text: preferReadableText(ocr, vision),
    vision: "",
    pages: 1,
    methods,
  };
}

export { vaultRead, textItemsToLines, TEXT_LAYER_MIN };
export type { PdfTextItem };
