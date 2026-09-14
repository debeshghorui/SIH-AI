import { ollama } from "../models/client";
import { getModel } from "../models/registry";

/**
 * Embed text with `nomic-embed-text`. Returns a Float32Array (768 dims).
 * Every call goes through the air-gap-wrapped global fetch.
 */
export async function embed(text: string): Promise<Float32Array> {
  const model = getModel("embed");
  const res = await ollama().embed({
    model: model.ollama,
    input: text,
  });
  const vec = res.embeddings?.[0];
  if (!vec || vec.length === 0) {
    throw new Error("empty embedding from nomic-embed-text");
  }
  return new Float32Array(vec);
}
