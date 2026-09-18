"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, CornerDownLeft, Paperclip, Square, X } from "lucide-react";
import { ChatMessageBody } from "@/components/chat-message-body";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  streamChat,
  type AgentEvent,
  type ChatMessage,
} from "@/lib/query/chat";
import { wantsInspectionBeat } from "@/lib/attachment-intent";
import { uploadToVault, streamInspect } from "@/lib/query/inspect";
import { publishTrace } from "@/lib/query/trace-bus";

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

export function Chat() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  // Keep the newest message in view as tokens stream in.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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
    setDraft("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const onEvent = (event: AgentEvent) => {
      if (event.type === "route" || event.type === "plan" || event.type === "observe") {
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
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="border-b">
        <CardTitle>Chat</CardTitle>
        <CardDescription>
          Local agent on 127.0.0.1 · nothing leaves this machine.
        </CardDescription>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 pt-(--card-spacing)">
        <ScrollArea className="h-full pr-3">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-4 py-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Ask about a tag, a procedure, or a document.
                </p>
                <p className="text-sm text-muted-foreground">
                  Attach a scan to summarise it, or ask to inspect it and get
                  an approval note.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDraft(suggestion)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <CornerDownLeft className="size-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-4 pb-1">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "flex flex-col items-end gap-1"
                      : "flex flex-col items-start gap-1"
                  }
                >
                  <span className="px-1 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                    {message.role === "user" ? "You" : "Assistant"}
                  </span>
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-secondary px-3.5 py-2.5"
                        : "max-w-[92%] rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5"
                    }
                  >
                    <ChatMessageBody
                      content={message.content}
                      error={message.error}
                      streaming={message.streaming}
                    />
                  </div>
                </li>
              ))}
              <div ref={bottomRef} />
            </ul>
          )}
        </ScrollArea>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-0">
        <form
          className="flex flex-col gap-2 rounded-xl border border-input bg-background p-2 transition-colors focus-within:border-ring dark:bg-input/30"
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
            <div className="flex items-center gap-2 self-start rounded-lg bg-muted px-2 py-1">
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
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach a scan or PDF"
            >
              <Paperclip />
            </Button>

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
                disabled={!draft.trim()}
                aria-label="Send message"
              >
                <ArrowUp />
              </Button>
            )}
          </div>
        </form>

        <p className="px-1 pt-2 pb-1 text-xs text-muted-foreground">
          Enter to send · Shift + Enter for a new line
        </p>
      </CardFooter>
    </Card>
  );
}
