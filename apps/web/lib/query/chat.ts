/**
 * Browser-side SSE consumer for POST /api/chat.
 *
 * EventSource does not support POST, so we read the stream by hand: fetch
 * with a ReadableStream body, decode chunk-by-chunk, split on the SSE frame
 * boundary (\n\n), and parse `event:` / `data:` lines into typed events.
 *
 * The event union mirrors apps/api/src/agent/events.ts. Only token/done/error
 * are emitted today; plan/observe/route are accepted so the UI keeps working
 * when the router and ReAct steps land.
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type AgentEvent =
  | { type: "token"; content: string }
  | { type: "done"; conversationId?: string }
  | { type: "error"; message: string }
  | { type: "plan"; thought: string }
  | { type: "observe"; tool: string; result: string }
  | {
      type: "route";
      store: "sql" | "vector" | "files" | "none";
      model: "nano" | "chat" | "coder" | "vision";
      tools: string[];
      reason: string;
    };

export type PreferModel = "nano" | "chat" | "coder";

export interface StreamChatInput {
  messages: ChatMessage[];
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  /** True when the last user message carries an image/scan attachment. */
  hasAttachment?: boolean;
  /** Vault filename after POST /upload — document text is read server-side. */
  attachmentName?: string;
  /** Generate-step preference. Omit for Auto (router chooses). */
  preferModel?: PreferModel;
  /** Existing thread. Omit to let Express create one on `done`. */
  conversationId?: string;
}

export async function streamChat(input: StreamChatInput): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({
      messages: input.messages,
      hasAttachment: input.hasAttachment ?? false,
      attachmentName: input.attachmentName,
      ...(input.preferModel ? { preferModel: input.preferModel } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    }),
    signal: input.signal,
  });

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      if (text) message = `${message}: ${text}`;
    } catch {
      // ignore body read errors
    }
    input.onEvent({ type: "error", message });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. The server writes \r\n\r\n,
      // but be lenient about \n\n too.
      let frameEnd: number;
      while (
        (frameEnd = findFrameBoundary(buffer)) !== -1
      ) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd).replace(/^(\r?\n){2}/, "");
        const event = parseFrame(frame);
        if (event) input.onEvent(event);
      }
    }
    if (buffer.trim()) {
      const event = parseFrame(buffer);
      if (event) input.onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
}

function findFrameBoundary(buf: string): number {
  const crlf = buf.indexOf("\r\n\r\n");
  const lf = buf.indexOf("\n\n");
  if (crlf === -1) return lf;
  if (lf === -1) return crlf;
  return Math.min(crlf, lf);
}

function parseFrame(frame: string): AgentEvent | null {
  let type = "message";
  let dataLine = "";
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      type = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLine = line.slice(5).trim();
    }
  }
  if (!dataLine) return null;
  try {
    const data = JSON.parse(dataLine) as { type?: string };
    // Trust the `event:` header; the data also carries `type` for round-trip.
    if (type === "token" && typeof (data as { content?: unknown }).content === "string") {
      return { type: "token", content: (data as { content: string }).content };
    }
    if (type === "done") {
      const id = (data as { conversationId?: unknown }).conversationId;
      return {
        type: "done",
        ...(typeof id === "string" ? { conversationId: id } : {}),
      };
    }
    if (type === "error" && typeof (data as { message?: unknown }).message === "string") {
      return { type: "error", message: (data as { message: string }).message };
    }
    if (type === "plan" && typeof (data as { thought?: unknown }).thought === "string") {
      return { type: "plan", thought: (data as { thought: string }).thought };
    }
    if (type === "observe") {
      const d = data as { tool?: string; result?: string };
      if (typeof d.tool === "string" && typeof d.result === "string") {
        return { type: "observe", tool: d.tool, result: d.result };
      }
    }
    if (type === "route") {
      const d = data as {
        store?: string;
        model?: string;
        tools?: string[];
        reason?: string;
      };
      if (
        d.store &&
        d.model &&
        Array.isArray(d.tools) &&
        typeof d.reason === "string"
      ) {
        return {
          type: "route",
          store: d.store as "sql" | "vector" | "files" | "none",
          model: d.model as "nano" | "chat" | "coder" | "vision",
          tools: d.tools,
          reason: d.reason,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}
