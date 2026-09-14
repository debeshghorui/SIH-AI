import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Plant tag registry. One row per instrument tag (e.g. 12-P-104).
 * `last_inspection_at` and `last_inspection_status` are surfaced in the
 * agentic beat to populate the approval note.
 */
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tag: text("tag").notNull().unique(),
  description: text("description").notNull(),
  line: text("line"),
  last_inspection_at: text("last_inspection_at"),
  last_inspection_status: text("last_inspection_status"),
});

/**
 * Inspection history per tag. The agentic beat reads the most recent rows
 * to build a findings table.
 */
export const inspections = sqliteTable("inspections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tag: text("tag").notNull(),
  inspected_at: text("inspected_at").notNull(),
  status: text("status").notNull(), // ok | leak | corrosion | vibration | overdue
  finding: text("finding").notNull(),
  inspector: text("inspector"),
});

/**
 * Knowledge-base chunks. One row per SOP section. `embedding` is a
 * sqlite-vec virtual column (vec0, 768 dims for nomic-embed-text) created
 * in `db.ts` via a separate `vec0` virtual table — drizzle cannot declare
 * `vec0` tables, so the vector table is managed in raw SQL alongside this.
 * `fts` is a generated FTS5 column over `body` for keyword fallback.
 */
export const kbChunks = sqliteTable("kb_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(), // e.g. sop_isolation.md
  heading: text("heading").notNull(),
  body: text("body").notNull(),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export type Tag = typeof tags.$inferSelect;
export type Inspection = typeof inspections.$inferSelect;
export type KbChunk = typeof kbChunks.$inferSelect;
