import { z } from "zod";

/**
 * SSE event schema for the agent loop. The wire format is:
 *   event: <type>\r\n
 *   data: <json>\r\n
 *   \r\n
 *
 * Today only `token`, `done`, `error` are emitted. `plan`, `observe`, and
 * `route` are declared here so the UI can switch on `type` now and the
 * router/ReAct steps can fill them in later without a wire-format change.
 */
export const tokenEventSchema = z.object({
  type: z.literal("token"),
  content: z.string(),
});

export const doneEventSchema = z.object({
  type: z.literal("done"),
  conversationId: z.string().optional(),
});

export const errorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});

// Forward declarations — not emitted yet, but the UI can handle them.
export const planEventSchema = z.object({
  type: z.literal("plan"),
  thought: z.string(),
});

export const observeEventSchema = z.object({
  type: z.literal("observe"),
  tool: z.string(),
  result: z.string(),
});

export const routeEventSchema = z.object({
  type: z.literal("route"),
  store: z.enum(["sql", "vector", "files", "none"]),
  model: z.enum(["nano", "chat", "coder", "vision"]),
  tools: z.array(z.string()),
  reason: z.string(),
});

export const agentEventSchema = z.discriminatedUnion("type", [
  tokenEventSchema,
  doneEventSchema,
  errorEventSchema,
  planEventSchema,
  observeEventSchema,
  routeEventSchema,
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type TokenEvent = z.infer<typeof tokenEventSchema>;
export type DoneEvent = z.infer<typeof doneEventSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;
