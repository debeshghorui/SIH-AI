import { sanitizeVaultName, vaultList } from "../tools/fs";
import { openDb, schema } from "./db";
import { embed } from "./embed";
import type { Citation } from "./retrieve";

const TOP_K = 5;
const CHUNK_CHARS = 1400;

export function chunkVaultText(
  text: string,
  max = CHUNK_CHARS,
): { heading: string; body: string }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const blocks = trimmed.split(/\n(?=--- page \d+ ---)/);
  const out: { heading: string; body: string }[] = [];
  for (const block of blocks) {
    const m = block.match(/^--- page (\d+) ---/);
    const heading = m ? `page ${m[1]}` : "document";
    const body = block.replace(/^--- page \d+ ---\s*/, "").trim();
    if (!body) continue;
    if (body.length <= max) {
      out.push({ heading, body });
      continue;
    }
    let i = 0;
    let part = 1;
    while (i < body.length) {
      let end = Math.min(i + max, body.length);
      if (end < body.length) {
        const nl = body.lastIndexOf("\n", end);
        if (nl > i + max * 0.5) end = nl;
      }
      const slice = body.slice(i, end).trim();
      if (slice) out.push({ heading: `${heading}.${part}`, body: slice });
      part += 1;
      i = end;
    }
  }
  return out;
}

function ftsQuery(query: string): string | null {
  const tokens = query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  const unique = [...new Set(tokens)].slice(0, 8);
  if (unique.length === 0) return null;
  return unique.join(" OR ");
}

function deleteChunksForSource(source: string): void {
  const { raw } = openDb();
  const existing = raw
    .prepare("SELECT id FROM vault_chunks WHERE source = ?")
    .all(source) as { id: number }[];
  for (const row of existing) {
    try {
      raw.prepare("DELETE FROM vault_chunks_vec WHERE chunk_id = ?").run(row.id);
    } catch {
      // vec0 delete is best-effort on older sqlite-vec builds
    }
    try {
      raw.prepare("DELETE FROM vault_chunks_fts WHERE rowid = ?").run(row.id);
    } catch {
      // FTS rowid may not match if a prior insert skipped it
    }
  }
  raw.prepare("DELETE FROM vault_chunks WHERE source = ?").run(source);
}

/** Drop indexed chunks for a vault filename (literal and collapsed). */
export function removeVaultIndex(source: string): void {
  const names = new Set([source, sanitizeVaultName(source)]);
  for (const name of names) {
    deleteChunksForSource(name);
  }
}

/**
 * Concatenate indexed extract for a vault file. Used on follow-ups so we
 * do not re-run vision/tesseract when `vault_chunks` already has the text.
 */
export function readVaultExtract(source: string): string {
  const names = [...new Set([source, sanitizeVaultName(source)])];
  const { raw } = openDb();
  for (const name of names) {
    const rows = raw
      .prepare(
        "SELECT heading, body FROM vault_chunks WHERE source = ? ORDER BY id",
      )
      .all(name) as { heading: string; body: string }[];
    if (rows.length === 0) continue;
    return rows
      .map((row) => row.body.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }
  return "";
}

export async function indexVaultText(
  source: string,
  text: string,
): Promise<{ chunks: number; embedded: number }> {
  const chunks = chunkVaultText(text);
  if (chunks.length === 0) return { chunks: 0, embedded: 0 };
  const { db, raw } = openDb();
  deleteChunksForSource(source);

  let embedded = 0;
  for (const chunk of chunks) {
    const inserted = db
      .insert(schema.vaultChunks)
      .values({
        source,
        heading: chunk.heading,
        body: chunk.body,
      })
      .returning({ id: schema.vaultChunks.id })
      .get();
    const chunkId = inserted!.id;
    raw
      .prepare(
        "INSERT INTO vault_chunks_fts (rowid, chunk_id, source, heading, body) VALUES (?, ?, ?, ?, ?)",
      )
      .run(chunkId, chunkId, source, chunk.heading, chunk.body);
    try {
      const vec = await embed(`${chunk.heading}\n${chunk.body.slice(0, 2000)}`);
      const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
      raw
        .prepare("INSERT INTO vault_chunks_vec (chunk_id, embedding) VALUES (?, ?)")
        .run(chunkId, buf);
      embedded += 1;
    } catch (err) {
      console.warn(
        `vault embed failed for ${source} ${chunk.heading}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return { chunks: chunks.length, embedded };
}

export function matchVaultFilenames(query: string): Citation[] {
  const tokens = (query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).slice(0, 8);
  if (tokens.length === 0) return [];
  const out: Citation[] = [];
  for (const file of vaultList()) {
    const name = file.name.toLowerCase();
    if (tokens.some((t) => name.includes(t))) {
      out.push({
        kind: "files",
        source: file.name,
        heading: "vault",
        snippet: `${file.name} (${file.size} bytes)`,
        score: 7,
      });
    }
  }
  return out;
}

export function retrieveVaultFts(query: string): Citation[] {
  const match = ftsQuery(query);
  if (!match) return [];
  const { raw } = openDb();
  try {
    const rows = raw
      .prepare(
        `SELECT chunk_id, source, heading, snippet(vault_chunks_fts, 3, '«', '»', '…', 12) AS snip, bm25(vault_chunks_fts) AS rank
         FROM vault_chunks_fts
         WHERE vault_chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(match, TOP_K) as {
      chunk_id: number;
      source: string;
      heading: string;
      snip: string;
      rank: number;
    }[];
    return rows.map((r) => ({
      kind: "files" as const,
      source: r.source,
      heading: r.heading,
      snippet: r.snip,
      score: Math.max(1, 10 + r.rank),
    }));
  } catch {
    return [];
  }
}

export async function retrieveVaultVector(query: string): Promise<Citation[]> {
  const { raw } = openDb();
  try {
    const q = await embed(query);
    const buf = Buffer.from(q.buffer, q.byteOffset, q.byteLength);
    const rows = raw
      .prepare(
        `SELECT chunk_id, distance
         FROM vault_chunks_vec
         WHERE embedding MATCH ?
         ORDER BY distance
         LIMIT ?`,
      )
      .all(buf, TOP_K) as { chunk_id: number; distance: number }[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.chunk_id);
    const placeholders = ids.map(() => "?").join(",");
    const chunks = raw
      .prepare(
        `SELECT id, source, heading, body FROM vault_chunks WHERE id IN (${placeholders})`,
      )
      .all(...ids) as {
      id: number;
      source: string;
      heading: string;
      body: string;
    }[];
    const byId = new Map(chunks.map((c) => [c.id, c]));
    return rows.flatMap((r) => {
      const c = byId.get(r.chunk_id);
      if (!c) return [];
      return [
        {
          kind: "files" as const,
          source: c.source,
          heading: c.heading,
          snippet: c.body.slice(0, 280),
          score: Math.max(0, 10 - r.distance),
        },
      ];
    });
  } catch {
    return [];
  }
}
