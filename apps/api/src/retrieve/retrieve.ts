import { z } from "zod";
import { eq, like, or } from "drizzle-orm";
import { openDb, schema } from "./db";
import { embed } from "./embed";

/**
 * Retrieval. Three stores, one ranker:
 *   - sql:     tag / inspection lookups against `tags` + `inspections`
 *   - vector:  sqlite-vec cosine search over `kb_chunks_vec` (nomic-embed-text)
 *   - files:   filenames in `data/vault/` matched by keyword
 *   - fts5:    keyword fallback when the best vector score < 6
 *
 * The ranker merges results into a top-5 list with a `score` and a `kind`
 * so the agent can cite sources in the answer.
 */

export const citationSchema = z.object({
  kind: z.enum(["sql", "vector", "fts", "files"]),
  source: z.string(),
  heading: z.string().optional(),
  snippet: z.string(),
  score: z.number(),
});

export type Citation = z.infer<typeof citationSchema>;

const TOP_K = 5;
const VECTOR_SCORE_FLOOR = 6; // below this, fall back to FTS5

/** SQL store: tag + last inspection. Returns 0..N citations. */
export function retrieveSql(query: string): Citation[] {
  const { db } = openDb();
  const tagMatch = query.match(/(\d{2}-[A-Z]{1,3}-\d{3})/i);
  const out: Citation[] = [];
  if (tagMatch) {
    const tag = tagMatch[1].toUpperCase();
    const tagRow = db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.tag, tag))
      .all();
    if (tagRow[0]) {
      out.push({
        kind: "sql",
        source: "tags",
        heading: tagRow[0].tag,
        snippet: `${tagRow[0].description}. Last inspection ${tagRow[0].last_inspection_at ?? "n/a"}: ${tagRow[0].last_inspection_status ?? "n/a"}.`,
        score: 10,
      });
    }
    const ins = db
      .select()
      .from(schema.inspections)
      .where(eq(schema.inspections.tag, tag))
      .all();
    for (const i of ins) {
      out.push({
        kind: "sql",
        source: "inspections",
        heading: `${i.tag} @ ${i.inspected_at}`,
        snippet: `${i.status}: ${i.finding}`,
        score: 9,
      });
    }
  }
  // Loose tag search if no exact match.
  if (out.length === 0) {
    const loose = db
      .select()
      .from(schema.tags)
      .where(
        or(
          like(schema.tags.tag, `%${query.slice(0, 8)}%`),
          like(schema.tags.description, `%${query.slice(0, 12)}%`),
        ),
      )
      .all();
    for (const t of loose.slice(0, 3)) {
      out.push({
        kind: "sql",
        source: "tags",
        heading: t.tag,
        snippet: t.description,
        score: 5,
      });
    }
  }
  return out;
}

/** Vector store: sqlite-vec cosine over kb_chunks_vec. */
export async function retrieveVector(query: string): Promise<Citation[]> {
  const { raw } = openDb();
  const q = await embed(query);
  const buf = Buffer.from(q.buffer, q.byteOffset, q.byteLength);
  const rows = raw
    .prepare(
      `SELECT chunk_id, distance
       FROM kb_chunks_vec
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
      `SELECT id, source, heading, body FROM kb_chunks WHERE id IN (${placeholders})`,
    )
    .all(...ids) as { id: number; source: string; heading: string; body: string }[];
  const byId = new Map(chunks.map((c) => [c.id, c]));

  return rows.map((r) => {
    const c = byId.get(r.chunk_id)!;
    // sqlite-vec returns L2 distance; convert to a 0..10 score (closer = higher).
    const score = Math.max(0, 10 - r.distance);
    return {
      kind: "vector" as const,
      source: c.source,
      heading: c.heading,
      snippet: c.body.slice(0, 280),
      score,
    };
  });
}

/** FTS5 keyword fallback. */
export function retrieveFts(query: string): Citation[] {
  const { raw } = openDb();
  try {
    const rows = raw
      .prepare(
        `SELECT chunk_id, source, heading, snippet(kb_chunks_fts, 3, '«', '»', '…', 12) AS snip, bm25(kb_chunks_fts) AS rank
         FROM kb_chunks_fts
         WHERE kb_chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, TOP_K) as { chunk_id: number; source: string; heading: string; snip: string; rank: number }[];
    return rows.map((r) => ({
      kind: "fts" as const,
      source: r.source,
      heading: r.heading,
      snippet: r.snip,
      // bm25 rank is negative (more negative = better); normalize loosely.
      score: Math.max(1, 10 + r.rank),
    }));
  } catch {
    return [];
  }
}

/** Files store: list vault filenames matching keywords. */
export function retrieveFiles(query: string): Citation[] {
  // Delegated to tools/fs.ts in a later phase; stub returns empty so the
  // router's `files` choice still flows through vector/fts for text.
  void query;
  return [];
}

/**
 * Merge + rank. Vector results above the floor win; if the best vector
 * score is below the floor, FTS5 fills in. SQL results always surface
 * (they are exact matches). Top-5 overall.
 */
export async function retrieve(
  query: string,
  store: "sql" | "vector" | "files" | "none",
): Promise<Citation[]> {
  const all: Citation[] = [];
  if (store === "sql" || store === "none") all.push(...retrieveSql(query));
  if (store === "vector" || store === "files" || store === "none") {
    const vec = await retrieveVector(query);
    all.push(...vec);
    if (vec.length === 0 || Math.max(...vec.map((v) => v.score)) < VECTOR_SCORE_FLOOR) {
      all.push(...retrieveFts(query));
    }
  }
  if (store === "files") all.push(...retrieveFiles(query));

  // Dedup by (source, heading), keep highest score, sort desc, top-5.
  const seen = new Set<string>();
  const merged = all
    .filter((c) => {
      const key = `${c.source}|${c.heading ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
  return merged;
}
