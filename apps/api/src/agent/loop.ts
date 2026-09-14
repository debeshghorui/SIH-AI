import type { Message } from "ollama";
import { ollama } from "../models/client";
import { getModel } from "../models/registry";
import { translateQuery } from "../query/translate";
import { route } from "../router/router";
import { retrieve, type Citation } from "../retrieve/retrieve";
import { extractFindings } from "../tools/ocr";
import type { AgentEvent } from "./events";

export interface RunAgentInput {
  messages: Message[];
  signal?: AbortSignal;
  /** Whether the user attached an image/scan to the last user message. */
  hasAttachment?: boolean;
  /** Vault filename when the UI uploaded a document for this turn. */
  attachmentName?: string;
}

/**
 * Full ReAct loop:
 *   1. translate (rewrite / step-back / decompose / HyDE) on the nano model
 *   2. route (store + model + tools + reason) on the nano model  -> emit `route`
 *   3. retrieve from the chosen store                          -> emit `observe`
 *   4. generate the answer on the routed model with citations -> stream `token`
 *   5. emit `done`
 *
 * Today steps 1-3 run, then the `chat` model streams the answer with the
 * retrieved context injected. Tool execution (ocr, sandbox, docx) is
 * delegated to the tools registry in a later phase; here the loop only
 * retrieves and generates. Every Ollama call goes through the air-gap
 * wrapped global fetch, so each step is logged as allowed loopback.
 */
export async function* runAgent(
  input: RunAgentInput,
): AsyncGenerator<AgentEvent, void, unknown> {
  const last = input.messages[input.messages.length - 1];
  const query = last?.content ?? "";

  // 1. Translate
  let translated;
  try {
    translated = await translateQuery(query);
  } catch {
    translated = {
      rewritten: query,
      stepBack: query,
      subQueries: [query],
      hyde: query,
    };
  }
  yield {
    type: "plan",
    thought: `translated: ${translated.rewritten}`,
  };

  // 2. Route
  const decision = await route(query, translated, {
    hasAttachment: input.hasAttachment,
  });
  yield {
    type: "route",
    store: decision.store,
    model: decision.model,
    tools: decision.tools,
    reason: decision.reason,
  };

  // 2b. Read an uploaded vault document into context (PDF text layer or vision).
  let attachmentContext = "";
  if (input.attachmentName) {
    yield {
      type: "plan",
      thought: `reading attachment ${input.attachmentName}`,
    };
    try {
      const doc = await extractFindings(input.attachmentName);
      attachmentContext = [doc.text, doc.vision].filter(Boolean).join("\n\n");
      if (attachmentContext) {
        yield {
          type: "observe",
          tool: "ocr",
          result: attachmentContext.slice(0, 500),
        };
      }
    } catch (err) {
      yield {
        type: "error",
        message: `attachment read failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 3. Retrieve
  let citations: Citation[] = [];
  try {
    citations = await retrieve(translated.rewritten, decision.store);
  } catch (err) {
    yield {
      type: "error",
      message: `retrieve failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (citations.length > 0) {
    yield {
      type: "observe",
      tool: `retrieve:${decision.store}`,
      result: citations
        .map((c) => `[${c.kind}] ${c.source} — ${c.snippet.slice(0, 120)}`)
        .join("\n"),
    };
  }

  // 4. Generate with citations injected.
  const context = citations
    .map((c, i) => `(${i + 1}) ${c.source} — ${c.heading ?? ""}: ${c.snippet}`)
    .join("\n");

  const answerModel = getModel(decision.model === "vision" ? "chat" : decision.model);
  const systemContent =
    "You are the MRPL sovereign workbench assistant. Answer concisely about plant SOPs, isolation, and approval notes. Cite sources as (1), (2), ... using the context. If context is empty, answer from general knowledge and say so." +
    (attachmentContext
      ? `\n\nAttached document (${input.attachmentName}):\n${attachmentContext.slice(0, 6000)}`
      : "") +
    (context ? `\n\nContext:\n${context}` : "");

  const genMessages: Message[] = [
    { role: "system", content: systemContent },
    ...input.messages.filter((m) => m.role !== "system"),
  ];

  let stream: AsyncIterable<{ message: { content: string } }>;
  try {
    stream = await ollama().chat({
      model: answerModel.ollama,
      messages: genMessages,
      stream: true,
    });
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    return;
  }

  try {
    for await (const chunk of stream) {
      const content = chunk.message?.content ?? "";
      if (content) yield { type: "token", content };
    }
    yield { type: "done" };
  } catch (err) {
    if (input.signal?.aborted) return;
    yield {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Back-compat shim: the old `runChat` name is kept so server.ts and any
 * tests keep working. It delegates to runAgent with no attachment.
 */
export async function* runChat(
  input: { messages: Message[]; signal?: AbortSignal },
): AsyncGenerator<AgentEvent, void, unknown> {
  yield* runAgent({ ...input, hasAttachment: false });
}
