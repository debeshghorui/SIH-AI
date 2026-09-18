import type { Message } from "ollama";
import { ollama } from "../models/client";
import { getModel } from "../models/registry";
import { translateQuery } from "../query/translate";
import { route } from "../router/router";
import {
  retrieve,
  VECTOR_SCORE_FLOOR,
  type Citation,
} from "../retrieve/retrieve";
import { extractFindings } from "../tools/ocr";
import type { AgentEvent } from "./events";

export type PreferModel = "nano" | "chat" | "coder";

export interface RunAgentInput {
  messages: Message[];
  signal?: AbortSignal;
  /** Whether the user attached an image/scan to the last user message. */
  hasAttachment?: boolean;
  /** Vault filename when the UI uploaded a document for this turn. */
  attachmentName?: string;
  /** User preference for the generate step. Router still chooses store + tools. */
  preferModel?: PreferModel;
}

/**
 * Full ReAct loop:
 *   1. translate (rewrite / step-back / decompose / HyDE) on the nano model
 *   2. route (store + model + tools + reason) on the nano model  -> emit `route`
 *   3. retrieve from the chosen store                          -> emit `step`
 *   4. generate the answer on the routed model with citations -> stream `token`
 *   5. emit `done`
 */
export async function* runAgent(
  input: RunAgentInput,
): AsyncGenerator<AgentEvent, void, unknown> {
  const last = input.messages[input.messages.length - 1];
  const query = last?.content ?? "";
  const nano = getModel("nano");

  // 1. Translate
  let translatedFailed = false;
  let translated;
  try {
    translated = await translateQuery(query);
  } catch {
    translatedFailed = true;
    translated = {
      rewritten: query,
      stepBack: query,
      subQueries: [query],
      hyde: query,
    };
  }
  yield {
    type: "step",
    stage: "translate",
    title: translatedFailed ? "Query translate (fallback)" : "Query translate",
    detail: translatedFailed
      ? "Nano JSON failed; using the original question for rewrite, step-back, sub-queries, and HyDE."
      : `Rewrote the question for retrieval on ${nano.ollama}.`,
    model: "nano",
    ollama: nano.ollama,
    data: {
      rewritten: translated.rewritten,
      stepBack: translated.stepBack,
      subQueries: translated.subQueries,
      hyde: translated.hyde,
    },
  };

  // 2. Route
  const routed = await route(query, translated, {
    hasAttachment: input.hasAttachment,
  });
  const decision = routed.decision;
  const routedAnswer = decision.model === "vision" ? "chat" : decision.model;
  const answerId = input.preferModel ?? routedAnswer;
  const reason = input.preferModel
    ? `${decision.reason} (user preferred ${input.preferModel})`
    : decision.reason;
  yield {
    type: "route",
    store: decision.store,
    model: input.preferModel ?? decision.model,
    tools: decision.tools,
    reason,
  };
  const routeLines = [
    `Nano chose store=${routed.nano.store}, model=${routed.nano.model}, tools=[${routed.nano.tools.join(", ")}].`,
    routed.parseFallback
      ? "Nano JSON parse failed; used the fallback decision."
      : null,
    routed.guarded
      ? `Guard corrected store ${routed.nano.store} → ${decision.store} because the query references plant data.`
      : "No store guard.",
    input.preferModel
      ? `User preferred generate model ${input.preferModel}; store and tools still from the router.`
      : null,
    `Final: store=${decision.store} model=${input.preferModel ?? decision.model} tools=[${decision.tools.join(", ")}]. ${reason}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
  yield {
    type: "step",
    stage: "route",
    title: routed.parseFallback
      ? "Router (fallback)"
      : routed.guarded
        ? "Router (store guarded)"
        : "Router",
    detail: routeLines,
    model: "nano",
    ollama: nano.ollama,
    data: {
      nanoStore: routed.nano.store,
      store: decision.store,
      guarded: routed.guarded,
      parseFallback: routed.parseFallback,
      ...(input.preferModel ? { preferModel: input.preferModel } : {}),
    },
  };

  // 2b. Read an uploaded vault document into context (PDF text layer or vision).
  let attachmentContext = "";
  if (input.attachmentName) {
    try {
      const doc = await extractFindings(input.attachmentName);
      attachmentContext = [doc.text, doc.vision].filter(Boolean).join("\n\n");
      yield {
        type: "step",
        stage: "tool",
        title: `OCR ${input.attachmentName}`,
        detail: attachmentContext
          ? attachmentContext.slice(0, 800)
          : "Attachment produced no extractable text or vision caption.",
        data: { tool: "ocr" },
      };
    } catch (err) {
      const message = `attachment read failed: ${err instanceof Error ? err.message : String(err)}`;
      yield { type: "error", message };
    }
  }

  // 3. Retrieve
  let citations: Citation[] = [];
  try {
    const result = await retrieve(translated.rewritten, decision.store);
    citations = result.citations;
    const ftsLine = result.usedFts
      ? `FTS5 keyword fallback because best vector score was ${result.bestVectorScore ?? 0} (floor ${VECTOR_SCORE_FLOOR}).`
      : "No FTS5 fallback.";
    if (decision.store === "none" && citations.length === 0) {
      yield {
        type: "step",
        stage: "retrieve",
        title: "Retrieve skipped",
        detail: "Router store is none — no plant documents were queried.",
        data: { store: "none", citations: [], usedFts: false },
      };
    } else {
      yield {
        type: "step",
        stage: "retrieve",
        title: citations.length
          ? `Retrieve ${decision.store} (${citations.length})`
          : `Retrieve ${decision.store} (empty)`,
        detail: citations.length
          ? ftsLine
          : `No citations from store ${decision.store}. ${ftsLine}`,
        data: {
          store: decision.store,
          citations,
          usedFts: result.usedFts,
        },
      };
    }
  } catch (err) {
    yield {
      type: "error",
      message: `retrieve failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Generate with citations injected.
  const context = citations
    .map((c, i) => `(${i + 1}) ${c.source} — ${c.heading ?? ""}: ${c.snippet}`)
    .join("\n");

  const answerModel = getModel(answerId);
  yield {
    type: "step",
    stage: "generate",
    title: "Generate answer",
    detail: `Streaming from ${answerId} (${answerModel.ollama}).`,
    model: answerId,
    ollama: answerModel.ollama,
  };

  const systemContent =
    "You are the MRPL sovereign workbench assistant. Answer concisely about plant SOPs, isolation, and approval notes. " +
    "Cite sources only as (1), (2), ... matching the numbered context below. Never invent a source, filename, or citation number that is not in the context. " +
    "If there is no context, answer from general knowledge and state plainly that no plant document was retrieved." +
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
