/**
 * Browser-side SSE consumer for POST /api/chat.
 *
 * EventSource does not support POST, so we read the stream by hand: fetch
 * with a ReadableStream body, decode chunk-by-chunk, split on the SSE frame
 * boundary (\n\n), and parse `event:` / `data:` lines into typed events.
 *
 * The event union mirrors apps/api/src/agent/events.ts.
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type StepStage =
  | "translate"
  | "route"
  | "retrieve"
  | "tool"
  | "generate"
  | "error";

export type StepCitation = {
  kind: string;
  source: string;
  heading?: string;
  score: number;
  snippet: string;
};

export type StepData = {
  rewritten?: string;
  stepBack?: string;
  subQueries?: string[];
  hyde?: string;
  nanoStore?: "sql" | "vector" | "files" | "none";
  store?: "sql" | "vector" | "files" | "none";
  guarded?: boolean;
  parseFallback?: boolean;
  preferModel?: string;
  citations?: StepCitation[];
  usedFts?: boolean;
  usedHyde?: boolean;
  queries?: string[];
  tool?: string;
};

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
    }
  | {
      type: "step";
      stage: StepStage;
      title: string;
      detail: string;
      model?: string;
      ollama?: string;
      data?: StepData;
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

      let frameEnd: number;
      while ((frameEnd = findFrameBoundary(buffer)) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd).replace(/^(\r?\n){2}/, "");
        const event = parseAgentSseFrame(frame);
        if (event) input.onEvent(event);
      }
    }
    if (buffer.trim()) {
      const event = parseAgentSseFrame(buffer);
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

const STAGES = new Set<StepStage>([
  "translate",
  "route",
  "retrieve",
  "tool",
  "generate",
  "error",
]);

function asStepData(raw: unknown): StepData | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const data: StepData = {};
  if (typeof d.rewritten === "string") data.rewritten = d.rewritten;
  if (typeof d.stepBack === "string") data.stepBack = d.stepBack;
  if (Array.isArray(d.subQueries)) {
    data.subQueries = d.subQueries.filter((s): s is string => typeof s === "string");
  }
  if (typeof d.hyde === "string") data.hyde = d.hyde;
  if (
    d.nanoStore === "sql" ||
    d.nanoStore === "vector" ||
    d.nanoStore === "files" ||
    d.nanoStore === "none"
  ) {
    data.nanoStore = d.nanoStore;
  }
  if (
    d.store === "sql" ||
    d.store === "vector" ||
    d.store === "files" ||
    d.store === "none"
  ) {
    data.store = d.store;
  }
  if (typeof d.guarded === "boolean") data.guarded = d.guarded;
  if (typeof d.parseFallback === "boolean") data.parseFallback = d.parseFallback;
  if (typeof d.preferModel === "string") data.preferModel = d.preferModel;
  if (typeof d.usedFts === "boolean") data.usedFts = d.usedFts;
  if (typeof d.tool === "string") data.tool = d.tool;
  if (Array.isArray(d.citations)) {
    data.citations = d.citations.flatMap((c) => {
      if (!c || typeof c !== "object") return [];
      const row = c as Record<string, unknown>;
      if (
        typeof row.kind !== "string" ||
        typeof row.source !== "string" ||
        typeof row.score !== "number" ||
        typeof row.snippet !== "string"
      ) {
        return [];
      }
      return [
        {
          kind: row.kind,
          source: row.source,
          score: row.score,
          snippet: row.snippet,
          ...(typeof row.heading === "string" ? { heading: row.heading } : {}),
        },
      ];
    });
  }
  return data;
}

/** Parse one SSE frame. Shared with the inspect stream consumer. */
export function parseAgentSseFrame(frame: string): AgentEvent | null {
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
    const data = JSON.parse(dataLine) as Record<string, unknown>;
    if (type === "token" && typeof data.content === "string") {
      return { type: "token", content: data.content };
    }
    if (type === "done") {
      const id = data.conversationId;
      return {
        type: "done",
        ...(typeof id === "string" ? { conversationId: id } : {}),
      };
    }
    if (type === "error" && typeof data.message === "string") {
      return { type: "error", message: data.message };
    }
    if (type === "plan" && typeof data.thought === "string") {
      return { type: "plan", thought: data.thought };
    }
    if (type === "observe") {
      if (typeof data.tool === "string" && typeof data.result === "string") {
        return { type: "observe", tool: data.tool, result: data.result };
      }
    }
    if (type === "route") {
      if (
        typeof data.store === "string" &&
        typeof data.model === "string" &&
        Array.isArray(data.tools) &&
        typeof data.reason === "string"
      ) {
        return {
          type: "route",
          store: data.store as "sql" | "vector" | "files" | "none",
          model: data.model as "nano" | "chat" | "coder" | "vision",
          tools: data.tools.filter((t): t is string => typeof t === "string"),
          reason: data.reason,
        };
      }
    }
    if (type === "step") {
      if (
        typeof data.stage === "string" &&
        STAGES.has(data.stage as StepStage) &&
        typeof data.title === "string" &&
        typeof data.detail === "string"
      ) {
        const extras = asStepData(data.data);
        return {
          type: "step",
          stage: data.stage as StepStage,
          title: data.title,
          detail: data.detail,
          ...(typeof data.model === "string" ? { model: data.model } : {}),
          ...(typeof data.ollama === "string" ? { ollama: data.ollama } : {}),
          ...(extras ? { data: extras } : {}),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}
