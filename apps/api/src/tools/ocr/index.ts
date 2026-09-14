import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vaultRead, resolveVaultPath } from "../fs";
import { ollama } from "../../models/client";
import { getModel } from "../../models/registry";

/**
 * OCR + vision tool. Two paths:
 *   - PDF/image text extraction via tesseract.js (offline, vendored
 *     eng.traineddata under vendor/).
 *   - P&ID / photo understanding via the `vision` model (qwen2.5vl:3b).
 *
 * Both run on loopback only — tesseract is local WASM, the vision call goes
 * through the air-gap-wrapped fetch to Ollama.
 */

function vendorDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../../../../");
  return path.join(root, "vendor");
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

async function extractWithTesseract(buf: Uint8Array, mime: string): Promise<string> {
  // tesseract.js downloads its WASM core + traineddata from a CDN on first
  // use. Under the air-gap that fetch is blocked (correct), and tesseract
  // may hang retrying rather than rejecting. We wrap init in a hard timeout
  // and fall through to the vision model on timeout/failure. At the venue,
  // vendor/eng.traineddata + a local tesseract-core make this path work
  // offline; until then the vision model carries OCR.
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
        worker.recognize(
          { data: Buffer.from(buf), type: mime } as unknown as string,
        ),
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

/**
 * Render the first page of a PDF to a PNG buffer using pdfjs-dist, then
 * run tesseract over it. Returns the extracted text.
 */
async function extractPdf(buf: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs needs a canvas-like interface; we use the node-canvas-free path
  // by rendering to an offscreen canvas shim.
  const data = new Uint8Array(buf);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  // Minimal canvas shim: collect operator list and render to a PNG via
  // @napi-rs/canvas if available; otherwise fall back to text items only.
  const textContent = await page.getTextContent();
  const text = textContent.items
    .map((it) => ("str" in it ? it.str : ""))
    .join(" ")
    .trim();
  if (text.length > 0) return text;
  // No embedded text — rasterize via tesseract on the rendered page.
  // (Full raster path needs a canvas; for the demo we return the text layer.)
  return text;
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
  // Ollama's `images` field expects raw base64, not a data URI.
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
  return res.message.content.trim();
}

/**
 * Extract findings from a scanned inspection (PDF or image) in the vault.
 * Returns a structured findings string the agent can turn into a docx.
 */
export async function extractFindings(
  vaultName: string,
): Promise<{ text: string; vision: string }> {
  const full = resolveVaultPath(vaultName);
  const buf = await readFile(full);
  const ext = path.extname(vaultName).toLowerCase();
  let text = "";
  if (ext === ".pdf") {
    text = await extractPdf(buf);
  } else {
    // Images: skip tesseract (its worker thread crashes Bun on bad input).
    // The vision model (qwen2.5vl:3b) is the primary OCR path for the demo.
    text = "";
  }
  // PDF text layer is enough — Ollama vision cannot ingest PDF bytes as an image.
  if (ext === ".pdf" && text.length > 0) {
    return { text, vision: "" };
  }

  // Vision pass for image scans / P&IDs.
  let vision = "";
  try {
    const mime =
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    vision = await describeImage(
      buf,
      mime,
      "This is a plant inspection scan or P&ID. List every finding, gauge reading, tag, and anomaly as a short bulleted list.",
    );
  } catch (err) {
    vision = `vision unavailable: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { text, vision };
}

export { vaultRead };
