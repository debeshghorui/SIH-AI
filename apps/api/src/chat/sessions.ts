import { asc, desc, eq } from "drizzle-orm";
import { openDb, schema } from "../retrieve/db";

export const DEFAULT_TITLE = "New chat";
export const TITLE_MAX = 80;

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`conversation not found: ${id}`);
    this.name = "ConversationNotFoundError";
  }
}

export type Conversation = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ConversationDetail = Conversation & {
  messages: StoredMessage[];
};

export type AppendMessage = {
  role: "user" | "assistant";
  content: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function toConversation(row: typeof schema.conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    title: row.title,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: typeof schema.messages.$inferSelect): StoredMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    createdAt: row.created_at,
  };
}

/** First user line, strip trailing attachment chip, trim to ~60 chars. */
export function titleFromUserMessage(content: string): string {
  const stripped = content
    .replace(/\n?\[attachment:\s*[^\]]+\]\s*$/i, "")
    .trim();
  const oneLine = stripped.split("\n")[0]?.trim() ?? "";
  if (!oneLine) return DEFAULT_TITLE;
  if (oneLine.length <= 60) return oneLine;
  return `${oneLine.slice(0, 57)}...`;
}

export function createConversation(title = DEFAULT_TITLE): Conversation {
  const { db } = openDb();
  const now = nowIso();
  const row = {
    id: crypto.randomUUID(),
    title,
    pinned: 0,
    created_at: now,
    updated_at: now,
  };
  db.insert(schema.conversations).values(row).run();
  return toConversation(row);
}

export function listConversations(): Conversation[] {
  const { db } = openDb();
  const rows = db
    .select()
    .from(schema.conversations)
    .orderBy(desc(schema.conversations.pinned), desc(schema.conversations.updated_at))
    .all();
  return rows.map(toConversation);
}

export function getConversation(id: string): ConversationDetail | null {
  const { db } = openDb();
  const header = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get();
  if (!header) return null;
  const rows = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversation_id, id))
    .orderBy(asc(schema.messages.created_at))
    .all();
  return {
    ...toConversation(header),
    messages: rows.map(toMessage),
  };
}

export function appendMessages(
  id: string,
  incoming: AppendMessage[],
): ConversationDetail {
  const { db } = openDb();
  const header = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get();
  if (!header) throw new ConversationNotFoundError(id);

  const now = nowIso();
  for (const msg of incoming) {
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    const content = msg.content.trim();
    if (!content) continue;
    db.insert(schema.messages)
      .values({
        id: crypto.randomUUID(),
        conversation_id: id,
        role: msg.role,
        content,
        created_at: now,
      })
      .run();
  }

  const firstUser = incoming.find((m) => m.role === "user" && m.content.trim());
  const nextTitle =
    header.title === DEFAULT_TITLE && firstUser
      ? titleFromUserMessage(firstUser.content)
      : header.title;

  db.update(schema.conversations)
    .set({ title: nextTitle, updated_at: now })
    .where(eq(schema.conversations.id, id))
    .run();

  const detail = getConversation(id);
  if (!detail) throw new ConversationNotFoundError(id);
  return detail;
}

export function setPinned(id: string, pinned: boolean): Conversation {
  const { db } = openDb();
  const existing = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get();
  if (!existing) throw new ConversationNotFoundError(id);
  db.update(schema.conversations)
    .set({ pinned: pinned ? 1 : 0 })
    .where(eq(schema.conversations.id, id))
    .run();
  const row = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get();
  if (!row) throw new ConversationNotFoundError(id);
  return toConversation(row);
}

export function setTitle(id: string, title: string): Conversation {
  const { db } = openDb();
  const trimmed = title.trim().slice(0, TITLE_MAX);
  if (!trimmed) throw new Error("title required");
  const existing = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get();
  if (!existing) throw new ConversationNotFoundError(id);
  const now = nowIso();
  db.update(schema.conversations)
    .set({ title: trimmed, updated_at: now })
    .where(eq(schema.conversations.id, id))
    .run();
  const row = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get();
  if (!row) throw new ConversationNotFoundError(id);
  return toConversation(row);
}

export function deleteConversation(id: string): void {
  const { db } = openDb();
  const existing = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .get();
  if (!existing) throw new ConversationNotFoundError(id);
  db.delete(schema.conversations).where(eq(schema.conversations.id, id)).run();
}