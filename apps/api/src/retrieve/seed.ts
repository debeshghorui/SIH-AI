import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { openDb, migrate, schema } from "./db";
import { embed } from "./embed";
import { loadRegistry } from "../models/registry";

/**
 * Seed `data/plant.sqlite` with tags, inspections, and SOP chunks read from
 * `data/kb/*.md`. Idempotent: existing rows are skipped. Run via
 * `bun run --filter api seed` (see package.json).
 *
 * KB markdown is split into chunks by `## ` headings; each chunk becomes one
 * row in `kb_chunks` + one vector in `kb_chunks_vec` + one FTS5 row.
 */

function rootDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../../");
}

function kbDir(): string {
  return path.join(rootDir(), "data/kb");
}

function splitMarkdown(md: string): { heading: string; body: string }[] {
  const lines = md.split(/\r?\n/);
  const chunks: { heading: string; body: string }[] = [];
  let current: { heading: string; body: string } | null = null;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current && current.body.trim()) chunks.push(current);
      current = { heading: line.slice(3).trim(), body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current && current.body.trim()) chunks.push(current);
  return chunks;
}

export async function seed(): Promise<void> {
  await loadRegistry();
  migrate();
  const { db, raw } = openDb();

  // --- Tags ---
  const seedTags: (typeof schema.tags.$inferInsert)[] = [
    {
      tag: "12-P-104",
      description: "Pressure transmitter on crude inlet separator",
      line: "Crude inlet",
      last_inspection_at: "2026-08-02",
      last_inspection_status: "ok",
    },
    {
      tag: "12-FT-208",
      description: "Flow transmitter on cooling water return",
      line: "Cooling water",
      last_inspection_at: "2026-07-15",
      last_inspection_status: "leak",
    },
    {
      tag: "12-LT-310",
      description: "Level transmitter on slop tank",
      line: "Slop",
      last_inspection_at: "2026-06-20",
      last_inspection_status: "corrosion",
    },
  ];
  for (const t of seedTags) {
    const existing = db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.tag, t.tag))
      .all();
    if (existing.length === 0) {
      db.insert(schema.tags).values(t).run();
    }
  }

  // --- Inspections ---
  const seedInspections: (typeof schema.inspections.$inferInsert)[] = [
    {
      tag: "12-FT-208",
      inspected_at: "2026-07-15",
      status: "leak",
      finding: "Flange leak at cooling water return manifold; 2 drips/min",
      inspector: "R. Kumar",
    },
    {
      tag: "12-LT-310",
      inspected_at: "2026-06-20",
      status: "corrosion",
      finding: "Pitting on slop tank level bridle; 0.4 mm max depth",
      inspector: "S. Nair",
    },
    {
      tag: "12-P-104",
      inspected_at: "2026-08-02",
      status: "ok",
      finding: "Calibration within range; no anomalies",
      inspector: "R. Kumar",
    },
  ];
  for (const ins of seedInspections) {
    db.insert(schema.inspections).values(ins).run();
  }

  // --- KB chunks ---
  const kbPath = kbDir();
  if (!existsSync(kbPath)) {
    console.warn(`[seed] no data/kb/ at ${kbPath}; skipping KB`);
    return;
  }
  const files = ["sop_isolation.md", "sop_leak_test.md", "sop_permit_to_work.md"];
  for (const file of files) {
    const fp = path.join(kbPath, file);
    if (!existsSync(fp)) {
      console.warn(`[seed] missing ${fp}; skipping`);
      continue;
    }
    const md = readFileSync(fp, "utf8");
    const chunks = splitMarkdown(md);
    for (const chunk of chunks) {
      const inserted = db
        .insert(schema.kbChunks)
        .values({
          source: file,
          heading: chunk.heading,
          body: chunk.body.trim(),
        })
        .returning({ id: schema.kbChunks.id })
        .get();
      const chunkId = inserted!.id;
      const vec = await embed(chunk.heading + "\n" + chunk.body);
      // sqlite-vec expects a packed BLOB for FLOAT[] columns.
      const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
      raw
        .prepare(
          "INSERT INTO kb_chunks_vec (chunk_id, embedding) VALUES (?, ?)",
        )
        .run(chunkId, buf);
      raw
        .prepare(
          "INSERT INTO kb_chunks_fts (chunk_id, source, heading, body) VALUES (?, ?, ?, ?)",
        )
        .run(chunkId, file, chunk.heading, chunk.body.trim());
    }
  }
  console.log("[seed] done");
}

if (import.meta.main) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
