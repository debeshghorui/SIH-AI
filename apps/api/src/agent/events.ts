import { z } from "zod";

/**
 * SSE event schema for the agent loop. The wire format is:
 *   event: <type>\r\n
 *   data: <json>\r\n
 *   \r\n
 *
 * `token` / `done` / `error` drive the chat bubble. `route` fills the Trace
 * badge row. `step` is the append-only judge timeline (translate → route →
 * retrieve → tool → generate). `plan` / `observe` remain accepted for older
 * frames.
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

export const planEventSchema = z.object({
  type: z.literal("plan"),
  thought: z.string(),
});

export const observeEventSchema = z.object({
  type: z.literal("observe"),
  tool: z.string(),
  result: z.string(),
});

export const storeEnum = z.enum(["sql", "vector", "files", "none"]);
export const modelEnum = z.enum(["nano", "chat", "coder", "vision"]);

export const routeEventSchema = z.object({
  type: z.literal("route"),
  store: storeEnum,
  model: modelEnum,
  tools: z.array(z.string()),
  reason: z.string(),
});

export const stepCitationSchema = z.object({
  kind: z.string(),
  source: z.string(),
  heading: z.string().optional(),
  score: z.number(),
  snippet: z.string(),
});

export const stepDataSchema = z.object({
  rewritten: z.string().optional(),
  stepBack: z.string().optional(),
  subQueries: z.array(z.string()).optional(),
  hyde: z.string().optional(),
  nanoStore: storeEnum.optional(),
  store: storeEnum.optional(),
  guarded: z.boolean().optional(),
  parseFallback: z.boolean().optional(),
  preferModel: z.string().optional(),
  citations: z.array(stepCitationSchema).optional(),
  usedFts: z.boolean().optional(),
  usedHyde: z.boolean().optional(),
  queries: z.array(z.string()).optional(),
  tool: z.string().optional(),
});

export const stepEventSchema = z.object({
  type: z.literal("step"),
  stage: z.enum([
    "translate",
    "route",
    "retrieve",
    "tool",
    "generate",
    "error",
  ]),
  title: z.string(),
  detail: z.string(),
  model: z.string().optional(),
  ollama: z.string().optional(),
  data: stepDataSchema.optional(),
});

export const agentEventSchema = z.discriminatedUnion("type", [
  tokenEventSchema,
  doneEventSchema,
  errorEventSchema,
  planEventSchema,
  observeEventSchema,
  routeEventSchema,
  stepEventSchema,
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type TokenEvent = z.infer<typeof tokenEventSchema>;
export type DoneEvent = z.infer<typeof doneEventSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;
export type StepEvent = z.infer<typeof stepEventSchema>;
export type StepData = z.infer<typeof stepDataSchema>;
