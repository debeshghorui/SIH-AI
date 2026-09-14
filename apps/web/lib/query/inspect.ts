"use client";

import { streamChat, type AgentEvent } from "@/lib/query/chat";

/**
 * Upload a file to the Express vault, then run the agentic inspection beat
 * (POST /api/inspect) and stream its SSE events. Used by the chat panel
 * when the user attaches a scan and asks for findings + approval note.
 */

export async function uploadToVault(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: buf,
    headers: { "content-type": "application/octet-stream" },
  });
  if (!res.ok) {
    throw new Error(`upload failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { name: string };
  return data.name;
}

export async function streamInspect(input: {
  name: string;
  tag: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}): Promise<void> {
  const res = await fetch("/api/inspect", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ name: input.name, tag: input.tag }),
    signal: input.signal,
  });

  if (!res.ok || !res.body) {
    input.onEvent({ type: "error", message: `HTTP ${res.status}` });
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
      while ((frameEnd = findFrame(buffer)) !== -1) {
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

// Same SSE frame helpers as chat.ts. Duplicated to keep this module
// standalone (no cross-imports into the chat hook).
function findFrame(buf: string): number {
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
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
  }
  if (!dataLine) return null;
  try {
    const d = JSON.parse(dataLine) as Record<string, unknown>;
    if (type === "token" && typeof d.content === "string")
      return { type: "token", content: d.content };
    if (type === "done") return { type: "done" };
    if (type === "error" && typeof d.message === "string")
      return { type: "error", message: d.message };
    if (type === "plan" && typeof d.thought === "string")
      return { type: "plan", thought: d.thought };
    if (type === "observe" && typeof d.tool === "string" && typeof d.result === "string")
      return { type: "observe", tool: d.tool, result: d.result };
    if (type === "route" && typeof d.store === "string" && typeof d.model === "string" &&
        Array.isArray(d.tools) && typeof d.reason === "string")
      return {
        type: "route",
        store: d.store as "sql" | "vector" | "files" | "none",
        model: d.model as "nano" | "chat" | "coder" | "vision",
        tools: d.tools as string[],
        reason: d.reason,
      };
  } catch {
    return null;
  }
  return null;
}

export { streamChat };
