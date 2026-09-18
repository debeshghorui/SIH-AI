import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

/**
 * Resolve `data/plant.sqlite` from this module's location:
 *   apps/api/src/retrieve/db.ts -> apps/api/src/retrieve -> src -> api -> apps -> <root>
 */
function dataDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../../../");
  return path.join(root, "data");
}

function sqlitePath(): string {
  return path.join(dataDir(), "plant.sqlite");
}

let dbSingleton: ReturnType<typeof drizzle<typeof schema>> | null = null;
let rawSingleton: Database | null = null;

/**
 * On macOS the system SQLite disables extension loading, so we point
 * `bun:sqlite` at the Homebrew vanilla build before creating any Database.
 * On Linux/Windows this is a no-op. The path is probed; if absent we fall
 * through to the built-in SQLite (sqlite-vec will then fail loudly at
 * `load()`, which is the correct signal that the venue box needs a vanilla
 * SQLite installed).
 */
function configureCustomSqlite(): void {
  const candidates = [
    "/opt/homebrew/Cellar/sqlite/3.53.4/lib/libsqlite3.dylib",
    "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
    "/usr/local/opt/sqlite/lib/libsqlite3.dylib",
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      Database.setCustomSQLite(c);
      return;
    }
  }
}

/**
 * Open (or create) the SQLite database, load the sqlite-vec extension, and
 * wrap it with drizzle. Idempotent — returns the same instances across
 * calls within a process.
 */
export function openDb(): {
  db: ReturnType<typeof drizzle<typeof schema>>;
  raw: Database;
} {
  if (dbSingleton && rawSingleton) {
    return { db: dbSingleton, raw: rawSingleton };
  }

  configureCustomSqlite();
  mkdirSync(dataDir(), { recursive: true });
  const raw = new Database(sqlitePath());
  raw.exec("PRAGMA journal_mode = WAL;");
  raw.exec("PRAGMA foreign_keys = ON;");

  try {
    sqliteVec.load(raw as unknown as Parameters<typeof sqliteVec.load>[0]);
  } catch (err) {
    // sqlite-vec ships a loadable extension. If the platform SQLite can't
    // load extensions (e.g. macOS system SQLite without setCustomSQLite),
    // rethrow with a clearer message.
    throw new Error(
      `sqlite-vec failed to load: ${err instanceof Error ? err.message : String(err)}. ` +
        `On macOS, install Homebrew sqlite (brew install sqlite) so bun:sqlite can load extensions.`,
    );
  }

  rawSingleton = raw;
  dbSingleton = drizzle(raw, { schema });
  return { db: dbSingleton, raw: rawSingleton };
}

/**
 * Create tables and the sqlite-vec + FTS5 virtual tables if absent. Safe to
 * call on every boot. The vector table mirrors `kb_chunks(id)` and stores
 * a 768-dim nomic-embed-text embedding per row.
 */
export function migrate(): void {
  const { raw } = openDb();

  raw.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      line TEXT,
      last_inspection_at TEXT,
      last_inspection_status TEXT
    );
  `);

  raw.exec(`
    CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL,
      inspected_at TEXT NOT NULL,
      status TEXT NOT NULL,
      finding TEXT NOT NULL,
      inspector TEXT
    );
  `);

  raw.exec(`
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      heading TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // sqlite-vec virtual table. 768 dims matches nomic-embed-text.
  raw.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_vec USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      embedding FLOAT[768]
    );
  `);

  // FTS5 keyword index over KB body, with a content mirror table so we can
  // rank without a join back to kb_chunks.
  raw.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      source,
      heading,
      body,
      tokenize = 'porter unicode61'
    );
  `);

  raw.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  raw.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  raw.exec(`
    CREATE INDEX IF NOT EXISTS messages_conversation_created
      ON messages(conversation_id, created_at);
  `);

  raw.exec(`
    CREATE INDEX IF NOT EXISTS conversations_pinned_updated
      ON conversations(pinned, updated_at);
  `);
}

export { schema };
