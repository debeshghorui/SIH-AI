"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  ChevronDown,
  MessageSquareText,
  Paperclip,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { ChatMessageBody } from "@/components/chat-message-body";
import {
  ModelPicker,
  usePreferModel,
} from "@/components/model-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  streamChat,
  type AgentEvent,
  type ChatMessage,
} from "@/lib/query/chat";
import { attachmentChipName, stripAttachmentChip, wantsInspectionBeat } from "@/lib/attachment-intent";
import { uploadToVault, streamInspect } from "@/lib/query/inspect";
import { publishTrace, resetTrace } from "@/lib/query/trace-bus";
import { getConversation } from "@/lib/query/conversations";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: boolean;
};

const SYSTEM_PROMPT =
  "You are the MRPL sovereign workbench assistant. Answer concisely about plant SOPs, isolation procedures, and approval notes. If you do not know, say so.";

const SUGGESTIONS = [
  "SOP for 12-P-104 isolation",
  "Last inspection on 12-P-104",
  "Summarise the attached document",
];

export function Chat({
  conversationId = null,
  onConversationBound,
}: {
  conversationId?: string | null;
  onConversationBound?: (id: string) => void;
} = {}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [preferModel, setPreferModel] = usePreferModel();
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const prevIdRef = useRef<string | null>(conversationId);
  const hydratedIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const conversationQuery = useQuery({
    queryKey: ["conversations", conversationId],
    queryFn: () => getConversation(conversationId!),
    enabled: Boolean(conversationId) && typeof window !== "undefined",
    staleTime: 0,
  });

  useEffect(() => {
    const prev = prevIdRef.current;
    prevIdRef.current = conversationId;
    if (prev && prev !== conversationId) {
      abortRef.current?.abort();
      setBusy(false);
      setDraft("");
      setMessages([]);
      hydratedIdRef.current = null;
      clearAttachment();
    } else if (!prev && conversationId) {
      if (hydratedIdRef.current === "pending") {
        hydratedIdRef.current = conversationId;
      }
    }
  }, [conversationId]);

  useEffect(() => {
    if (busy) return;
    const data = conversationQuery.data;
    if (!conversationId || !data || data.id !== conversationId) return;
    if (hydratedIdRef.current === conversationId) return;
    hydratedIdRef.current = conversationId;
    setMessages(
      data.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })),
    );
  }, [busy, conversationId, conversationQuery.data]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    bottomRef.current?.scrollIntoView({ block: "end", behavior });
  }

  function onThreadScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinnedToBottom(distance < 48);
  }

  // Keep the newest message in view while streaming if the user is at the bottom.
  useEffect(() => {
    if (pinnedToBottom) {
      scrollToBottom("auto");
    }
  }, [messages, pinnedToBottom]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    const userMsg: DisplayMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: attachment ? `${text}\n[attachment: ${attachment.name}]` : text,
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: DisplayMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };
    setMessages((current) => [...current, userMsg, assistantMsg]);
    setPinnedToBottom(true);
    setDraft("");
    setBusy(true);
    hydratedIdRef.current = conversationId ?? "pending";

    const controller = new AbortController();
    abortRef.current = controller;
    resetTrace();

    const onEvent = (event: AgentEvent) => {
      if (
        event.type === "route" ||
        event.type === "plan" ||
        event.type === "observe" ||
        event.type === "step" ||
        event.type === "error"
      ) {
        publishTrace(event);
      }
      if (event.type === "token") {
        setMessages((current) =>
          current.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + event.content }
              : m,
          ),
        );
      } else if (event.type === "error") {
        setMessages((current) =>
          current.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  streaming: false,
                  error: true,
                  content: m.content || `Error: ${event.message}`,
                }
              : m,
          ),
        );
      } else if (event.type === "done") {
        setMessages((current) =>
          current.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m,
          ),
        );
        if (event.conversationId) {
          onConversationBound?.(event.conversationId);
        }
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
    };

    const history: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMsg.content },
    ];

    async function afterUpload(name: string) {
      await queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      return name;
    }

    if (attachment && wantsInspectionBeat(text, attachment)) {
      // Demo beat 2: scan → findings → approval_note.docx
      const tagMatch = text.match(/(\d{2}-[A-Z]{1,3}-\d{3})/i);
      const tag = tagMatch?.[1]?.toUpperCase() ?? "12-P-104";
      try {
        const name = await afterUpload(await uploadToVault(attachment));
        await streamInspect({ name, tag, signal: controller.signal, onEvent });
      } catch (err) {
        if (!controller.signal.aborted) {
          onEvent({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        setMessages((current) =>
          current.map((m) =>
            m.id === assistantId && m.streaming
              ? { ...m, streaming: false }
              : m,
          ),
        );
      }
    } else if (attachment) {
      // Summary / Q&A over an uploaded PDF or image — chat with vault text.
      try {
        const name = await afterUpload(await uploadToVault(attachment));
        await streamChat({
          messages: history,
          signal: controller.signal,
          hasAttachment: true,
          attachmentName: name,
          preferModel: preferModel === "auto" ? undefined : preferModel,
          conversationId: conversationId ?? undefined,
          onEvent,
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          onEvent({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } else {
      await streamChat({
        messages: history,
        signal: controller.signal,
        preferModel: preferModel === "auto" ? undefined : preferModel,
        conversationId: conversationId ?? undefined,
        onEvent,
      });
    }

    if (attachment) {
      clearAttachment();
    }

    setBusy(false);
    abortRef.current = null;
  }

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    if (f) setAttachment(f);
  }

  function clearAttachment() {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
    setMessages((current) =>
      current.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }

  return (
    <section
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card/40 shadow-sm"
      aria-label="Chat"
    >
      <div
        ref={scrollRef}
        onScroll={onThreadScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 sm:pt-6 md:px-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[min(52vh,26rem)] flex-col items-center justify-center gap-7 px-2 text-center sm:gap-8">
              <div className="flex max-w-md flex-col items-center gap-3.5">
                <div
                  className="flex size-11 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-foreground"
                  aria-hidden
                >
                  <Sparkles className="size-5 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-semibold tracking-tight sm:text-xl">
                    How can I help?
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Equipment tags, isolation SOPs, and inspections — all on
                    prem. Attach a scan to summarise or draft an approval note.
                  </p>
                </div>
              </div>
              <div className="grid w-full max-w-md gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDraft(suggestion)}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/25 px-3.5 py-2.5 text-left text-sm text-foreground/90 transition-colors hover:border-foreground/20 hover:bg-muted/50"
                  >
                    <MessageSquareText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-6 sm:gap-8">
              {messages.map((message) => {
                if (
                  message.role === "assistant" &&
                  !message.content &&
                  !message.streaming
                ) {
                  return null;
                }

                if (message.role === "user") {
                  const visible = stripAttachmentChip(message.content);
                  const fileName = attachmentChipName(message.content);
                  return (
                    <li key={message.id} className="flex justify-end">
                      <div
                        className="max-w-[min(100%,34rem)] rounded-2xl border border-border/40 bg-chat-user px-4 py-2.5 text-[0.9375rem] leading-7 text-chat-user-foreground"
                      >
                        <div className="flex flex-col gap-1.5">
                          {visible ? (
                            <p className="whitespace-pre-wrap break-words">
                              {visible}
                            </p>
                          ) : null}
                          {fileName ? (
                            <div className="flex items-center gap-1.5 self-start rounded-md border border-border/40 bg-background/50 px-2 py-0.5">
                              <Paperclip
                                className="size-3 shrink-0 opacity-70"
                                aria-hidden
                              />
                              <span className="max-w-52 truncate font-mono text-[0.7rem] opacity-90">
                                {fileName}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={message.id} className="w-full min-w-0 py-0.5">
                    <ChatMessageBody
                      content={message.content}
                      error={message.error}
                      streaming={message.streaming}
                    />
                  </li>
                );
              })}
              <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
            </ul>
          )}
        </div>
      </div>

      {!pinnedToBottom && messages.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] z-10 flex justify-center">
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            className="pointer-events-auto size-8 rounded-full shadow-md"
            aria-label="Scroll to latest message"
            onClick={() => {
              setPinnedToBottom(true);
              scrollToBottom();
            }}
          >
            <ChevronDown />
          </Button>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-border/50 bg-card/60 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-md sm:px-4 sm:pb-4 sm:pt-3 md:px-6">
        <form
          className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-border/60 bg-background/95 p-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:ring-2 focus-within:ring-ring/40"
          onSubmit={onSubmit}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onPickFile}
          />

          {attachment && (
            <div className="flex items-center gap-2 self-start rounded-md border border-border/50 bg-muted/50 px-2 py-1">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-56 truncate font-mono text-xs">
                {attachment.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {(attachment.size / 1024).toFixed(0)} KB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Remove attachment"
                onClick={clearAttachment}
              >
                <X />
              </Button>
            </div>
          )}

          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              attachment ? "Ask about this file…" : "Ask anything…"
            }
            rows={1}
            className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-1.5 py-1.5 focus-visible:ring-0 dark:bg-transparent"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach a scan or PDF"
              >
                <Paperclip />
              </Button>
              <ModelPicker
                value={preferModel}
                onChange={setPreferModel}
                disabled={busy}
              />
            </div>

            {busy ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={stop}
                aria-label="Stop generating"
              >
                <Square />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon-sm"
                className="rounded-full shadow-sm"
                disabled={!draft.trim()}
                aria-label="Send message"
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </form>
        <p className="mx-auto mt-2 max-w-3xl px-2 text-center text-[0.68rem] text-muted-foreground/90">
          On-prem only · Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </section>
  );
}
