import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/query/api";

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

export function listConversations() {
  return apiGet<{ items: Conversation[] }>("/api/conversations");
}

export function createConversation() {
  return apiPost<Conversation>("/api/conversations");
}

export function getConversation(id: string) {
  return apiGet<ConversationDetail>(`/api/conversations/${encodeURIComponent(id)}`);
}

export function patchConversation(
  id: string,
  body: { pinned?: boolean; title?: string },
) {
  return apiPatch<Conversation>(
    `/api/conversations/${encodeURIComponent(id)}`,
    body,
  );
}

export function deleteConversation(id: string) {
  return apiDelete<{ ok: true; id: string }>(
    `/api/conversations/${encodeURIComponent(id)}`,
  );
}
