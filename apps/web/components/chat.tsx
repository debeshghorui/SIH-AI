"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Paperclip } from "lucide-react";
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

export function Chat() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

    if (attachment && wantsInspectionBeat(text, attachment)) {
      // Demo beat 2: scan → findings → approval_note.docx
      const tagMatch = text.match(/(\d{2}-[A-Z]{1,3}-\d{3})/i);
      const tag = tagMatch?.[1]?.toUpperCase() ?? "12-P-104";
      try {
        const name = await uploadToVault(attachment);
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
        const name = await uploadToVault(attachment);
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
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

    setBusy(false);
    abortRef.current = null;
  }

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    if (f) setAttachment(f);
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
          Streams from Express /chat → Ollama qwen2.5:7b-instruct on
          127.0.0.1:11434. Loopback only.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pt-(--card-spacing)">
        <ScrollArea className="h-full pr-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ask a SOP question for tag 12-P-104, or paste a finding. The
              agent loop lives in Express, not in this Next app.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-8 rounded-lg bg-secondary px-3 py-2"
                      : "mr-8 rounded-lg bg-muted px-3 py-2"
                  }
                >
                  <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                    {message.role}
                  </p>
                  <p
                    className={
                      message.error
                        ? "mt-1 text-sm leading-6 text-destructive"
                        : "mt-1 whitespace-pre-wrap text-sm leading-6"
                    }
                  >
                    {message.content}
                    {message.streaming ? (
                      <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-muted-foreground/60 align-middle" />
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <form className="flex w-full items-end gap-2" onSubmit={onSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onPickFile}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach scan"
          >
            <Paperclip />
          </Button>
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
              attachment
                ? `Ask about ${attachment.name} — summary, SOP, or inspect 12-P-104…`
                : "SOP for 12-P-104 isolation…"
            }
            rows={2}
            className="min-h-16 flex-1"
          />
          {busy ? (
            <Button type="button" variant="outline" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!draft.trim()}>
              Send
            </Button>
          )}
        </form>
        {attachment && (
          <p className="mt-2 text-xs text-muted-foreground">
            attached: {attachment.name} ({(attachment.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
