import type { Message } from "ollama";
import { ollama } from "../models/client";
import { getModel } from "../models/registry";
import {
  nearDuplicate,
  retrievalPlan,
  translateQuery,
} from "../query/translate";
import { route } from "../router/router";
import {
  retrieve,
  VECTOR_SCORE_FLOOR,
  type Citation,
} from "../retrieve/retrieve";
import { extractFindings } from "../tools/ocr";
import { indexVaultText, readVaultExtract } from "../retrieve/vault-index";
import { resolveStickyAttachment, isThinExtract, wantsVerbatimExtract } from "./attachment";
import {
  codingSystemPrompt,
  conversationHasProject,
  existingProjectPrompt,
  isCodingTurn,
  looksLikeCodeRequest,
} from "./code-files";
import type { AgentEvent } from "./events";

const ATTACH_INLINE_CHARS = 18_000;

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
  /** Chat thread that owns `data/vault/projects/<id>/`. */
  conversationId?: string;
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
  const resolved = resolveStickyAttachment({
    query,
    messages: input.messages,
    attachmentName: input.attachmentName,
  });
  const attachmentName = resolved.attachmentName;
  const hasAttachment = Boolean(input.hasAttachment || attachmentName);

  // 1. Translate
  let translatedFailed = false;
  let translated: Awaited<ReturnType<typeof translateQuery>>;
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
  const extraSubs = translated.subQueries.filter(
    (q) => !nearDuplicate(q, translated.rewritten),
  );
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
      ...(nearDuplicate(translated.stepBack, translated.rewritten)
        ? {}
        : { stepBack: translated.stepBack }),
      ...(extraSubs.length ? { subQueries: extraSubs } : {}),
      ...(nearDuplicate(translated.hyde, translated.rewritten)
        ? {}
        : { hyde: translated.hyde }),
    },
  };

  // 2. Route
  const userTurns = input.messages.filter((m) => m.role === "user");
  const priorCoding = userTurns
    .slice(0, -1)
    .some((m) => looksLikeCodeRequest(m.content));
  const hasProject = conversationHasProject(input.conversationId);
  const codingQuery = isCodingTurn(query, input.preferModel, undefined, {
    priorCoding,
    hasProject,
  });
  const routed = await route(query, translated, {
    hasAttachment,
    coding: codingQuery && !hasAttachment,
  });
  const decision = routed.decision;
  const routedAnswer = decision.model === "vision" ? "chat" : decision.model;
  const answerId =
    input.preferModel ??
    (codingQuery && !hasAttachment ? "coder" : routedAnswer);
  const reason = input.preferModel
    ? `${decision.reason} (user preferred ${input.preferModel})`
    : decision.reason;
  yield {
    type: "route",
    store: decision.store,
    model: input.preferModel ?? (codingQuery && !hasAttachment ? "coder" : decision.model),
    tools: decision.tools,
    reason,
  };
  const routeLines = [
    `Nano chose store=${routed.nano.store}, model=${routed.nano.model}, tools=[${routed.nano.tools.join(", ")}].`,
    routed.parseFallback
      ? "Nano JSON parse failed; used the fallback decision."
      : null,
    routed.guarded
      ? `Guard corrected store ${routed.nano.store} → ${decision.store}, model ${routed.nano.model} → ${decision.model}.`
      : "No router guard.",
    input.preferModel
      ? `User preferred generate model ${input.preferModel}; store and tools still from the router.`
      : null,
    `Final: store=${decision.store} model=${answerId} tools=[${decision.tools.join(", ")}]. ${reason}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
  yield {
    type: "step",
    stage: "route",
    title: routed.parseFallback
      ? "Router (fallback)"
      : routed.guarded
        ? "Router (guarded)"
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

  // 2b. Read the vault document. Fresh uploads run OCR/vision. Follow-ups
  // that refer to the last file reuse vault_chunks so plant SOP is skipped.
  let attachmentContext = "";
  if (attachmentName) {
    const cached = resolved.sticky ? readVaultExtract(attachmentName) : "";
    const reuseCache = Boolean(cached) && !isThinExtract(cached);
    if (reuseCache) {
      attachmentContext = cached;
      yield {
        type: "step",
        stage: "tool",
        title: `Reuse ${attachmentName}`,
        detail: `Follow-up refers to the last attached file (${cached.length} chars from vault index). Plant SOP stores will not be queried.`,
        data: { tool: "fs" },
      };
    } else {
      try {
        const doc = await extractFindings(attachmentName, {
          purpose: "document",
        });
        attachmentContext = [doc.text, doc.vision].filter(Boolean).join("\n\n");
        const methods = doc.methods.length ? doc.methods.join("+") : "none";
        yield {
          type: "step",
          stage: "tool",
          title: resolved.sticky
            ? `OCR ${attachmentName} (thin cache)`
            : `OCR ${attachmentName}`,
          detail: attachmentContext
            ? `${doc.pages} page(s), method=${methods}. ${attachmentContext.slice(0, 800)}`
            : "Attachment produced no extractable text or vision caption.",
          data: { tool: "ocr" },
        };
        if (attachmentContext) {
          try {
            const indexed = await indexVaultText(
              attachmentName,
              attachmentContext,
            );
            yield {
              type: "step",
              stage: "tool",
              title: `Index ${attachmentName}`,
              detail: `Stored ${indexed.chunks} vault chunk(s); ${indexed.embedded} embedded for later file search.`,
              data: { tool: "fs" },
            };
          } catch (err) {
            yield {
              type: "step",
              stage: "tool",
              title: `Index ${attachmentName} failed`,
              detail: err instanceof Error ? err.message : String(err),
              data: { tool: "fs" },
            };
          }
        }
      } catch (err) {
        const message = `attachment read failed: ${err instanceof Error ? err.message : String(err)}`;
        yield { type: "error", message };
      }
    }
  }

  // 3. Retrieve. Attached files skip plant SOP stores; long extracts still
  // query the vault index for the passages that match the question.
  let citations: Citation[] = [];
  const skipPlant = !attachmentName && (codingQuery || decision.model === "coder");
  const retrieveStore = attachmentName ? "files" : skipPlant ? "none" : decision.store;
  const shortAttach =
    Boolean(attachmentContext) &&
    attachmentContext.length <= ATTACH_INLINE_CHARS;
  try {
    if (shortAttach) {
      yield {
        type: "step",
        stage: "retrieve",
        title: "Retrieve files (attached)",
        detail: `Using extracted text from ${attachmentName} (${attachmentContext.length} chars). Plant SOP stores were not queried.`,
        data: {
          store: "files",
          citations: [],
          usedFts: false,
          queries: [],
          usedHyde: false,
        },
      };
    } else {
      const plan = retrievalPlan(translated, query);
      const result = await retrieve(plan.queries, retrieveStore, {
        hyde: retrieveStore === "vector" ? plan.hyde : undefined,
      });
      citations = result.citations;
      const searched = result.queries.join(" | ");
      const hydeLine = result.usedHyde ? " HyDE embedded on the vector path." : "";
      const ftsLine = result.usedFts
        ? `FTS5 keyword fallback because best vector score was ${result.bestVectorScore ?? 0} (floor ${VECTOR_SCORE_FLOOR}).`
        : "No FTS5 fallback.";
      if (retrieveStore === "none" && citations.length === 0) {
        yield {
          type: "step",
          stage: "retrieve",
          title: "Retrieve skipped",
          detail: "Router store is none — no plant documents were queried.",
          data: {
            store: "none",
            citations: [],
            usedFts: false,
            queries: result.queries,
            usedHyde: result.usedHyde,
          },
        };
      } else {
        yield {
          type: "step",
          stage: "retrieve",
          title: citations.length
            ? `Retrieve ${retrieveStore} (${citations.length})`
            : `Retrieve ${retrieveStore} (empty)`,
          detail: citations.length
            ? `Searched: ${searched}.${hydeLine} ${ftsLine}`
            : `No citations from store ${retrieveStore}. Searched: ${searched}.${hydeLine} ${ftsLine}`,
          data: {
            store: retrieveStore,
            citations,
            usedFts: result.usedFts,
            queries: result.queries,
            usedHyde: result.usedHyde,
          },
        };
      }
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
  const coding =
    !attachmentContext &&
    isCodingTurn(query, input.preferModel, decision.model, {
      priorCoding,
      hasProject,
    });
  yield {
    type: "step",
    stage: "generate",
    title: "Generate answer",
    detail: `Streaming from ${answerId} (${answerModel.ollama}).`,
    model: answerId,
    ollama: answerModel.ollama,
  };

  const systemContent = generateSystemPrompt({
    attachmentName,
    attachmentContext,
    citationsContext: context,
    verbatim: wantsVerbatimExtract(query),
    coding,
    projectFiles: coding ? existingProjectPrompt(input.conversationId) : "",
  });

  const genMessages: Message[] = [
    { role: "system", content: systemContent },
    ...input.messages.filter((m) => {
      if (m.role === "system") return false;
      // Prior refusals few-shot the coder into "I will not generate".
      // Existing files live in the system snapshot, not in chat.
      if (coding && m.role === "assistant") return false;
      return true;
    }),
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

function inlineAttachment(text: string): string {
  if (text.length <= ATTACH_INLINE_CHARS) return text;
  return (
    text.slice(0, 8_000) +
    "\n\n[... middle pages stored in the vault index; matching passages are in the numbered context ...]\n\n" +
    text.slice(-4_000)
  );
}

function generateSystemPrompt(input: {
  attachmentName?: string;
  attachmentContext: string;
  citationsContext: string;
  verbatim?: boolean;
  coding?: boolean;
  projectFiles?: string;
}): string {
  const citeRule =
    "Cite sources only as (1), (2), ... matching the numbered context below. Never invent a source, filename, or citation number that is not in the context.";

  if (input.attachmentContext) {
    const how =
      input.verbatim
        ? "The user asked for the file text. Reproduce the extract verbatim as markdown. Do not paraphrase, shorten, or skip list items."
        : "Answer using the attached document extract. Quote or paraphrase only what appears there.";
    return [
      "You are a document assistant on a sovereign on-prem workbench.",
      how,
      "If the extract is empty or clearly incomplete, say you could not read that part of the file. Do not invent titles, course names, authors, dates, or section content.",
      "Do not treat the file as a plant SOP unless the extract itself is a plant document.",
      citeRule,
      `Attached document (${input.attachmentName}):\n${inlineAttachment(input.attachmentContext)}`,
      input.citationsContext
        ? `Retrieved vault passages:\n${input.citationsContext}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (input.coding) {
    return codingSystemPrompt(input.projectFiles ?? "");
  }

  return (
    "You are the MRPL sovereign workbench assistant. Answer concisely about plant SOPs, isolation, and approval notes. " +
    citeRule +
    " If there is no context, answer from general knowledge and state plainly that no plant document was retrieved." +
    (input.citationsContext ? `\n\nContext:\n${input.citationsContext}` : "")
  );
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
