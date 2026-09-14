import type { AgentEvent } from "@/lib/query/chat";

/**
 * Tiny module-level pub/sub for agent trace events. The chat component
 * publishes `route` / `plan` / `observe` events as they stream in; the
 * Trace panel subscribes and renders them live. No React context needed —
 * this is a single-process, single-tab workbench.
 */

type Listener = (event: AgentEvent) => void;
const listeners = new Set<Listener>();

export function subscribeTrace(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishTrace(event: AgentEvent): void {
  for (const l of listeners) l(event);
}
