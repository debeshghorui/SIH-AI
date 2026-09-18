import type { AgentEvent } from "../agent/events";
import { appendMessages, createConversation } from "./sessions";

/**
 * After a successful `done`, persist the last user turn + streamed assistant
 * reply. Creates a conversation when `conversationId` is omitted. Abort and
 * `error` events skip the write.
 */
export async function* withPersistedDone(
  events: AsyncIterable<AgentEvent>,
  input: { conversationId?: string; userContent: string },
): AsyncGenerator<AgentEvent, void, unknown> {
  let assistant = "";
  let failed = false;
  for await (const event of events) {
    if (event.type === "token") assistant += event.content;
    if (event.type === "error") failed = true;
    if (event.type === "done") {
      let conversationId = input.conversationId;
      if (!failed && input.userContent.trim()) {
        try {
          conversationId = persistChatTurn({
            conversationId,
            userContent: input.userContent,
            assistantContent: assistant,
          });
        } catch (err) {
          yield {
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          };
          return;
        }
      }
      yield { type: "done", conversationId };
      continue;
    }
    yield event;
  }
}

export function persistChatTurn(input: {
  conversationId?: string;
  userContent: string;
  assistantContent: string;
}): string {
  const id = input.conversationId ?? createConversation().id;
  const incoming = [{ role: "user" as const, content: input.userContent }];
  if (input.assistantContent.trim()) {
    incoming.push({
      role: "assistant" as const,
      content: input.assistantContent,
    });
  }
  appendMessages(id, incoming);
  return id;
}
