import type { AgentEvent } from "@/lib/query/chat";

/**
 * Tiny module-level pub/sub for agent trace events. The chat component
 * publishes `step` / `route` / `error` (and leftover plan/observe) as they
 * stream in; the Trace panel subscribes and renders them live. `reset` is
 * client-only — not an SSE event — and clears the timeline on each Send.
 */

export type TraceBusEvent = AgentEvent | { type: "reset" };

type Listener = (event: TraceBusEvent) => void;
const listeners = new Set<Listener>();

export function subscribeTrace(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishTrace(event: AgentEvent): void {
  for (const l of listeners) l(event);
}

export function resetTrace(): void {
  for (const l of listeners) l({ type: "reset" });
}
