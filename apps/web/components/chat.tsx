"use client";

import { useState, type FormEvent } from "react";
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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const WAITING =
  "Express is not running yet. The agent host will stream here from :8787 via /api.";

export function Chat() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: text },
      { id: crypto.randomUUID(), role: "assistant", content: WAITING },
    ]);
    setDraft("");
  }

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="border-b">
        <CardTitle>Chat</CardTitle>
        <CardDescription>
          Browser talks only to same-origin /api, rewritten to Express.
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
                  <p className="mt-1 text-sm leading-6">{message.content}</p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <form className="flex w-full items-end gap-2" onSubmit={onSubmit}>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="SOP for 12-P-104 isolation…"
            rows={2}
            className="min-h-16 flex-1"
          />
          <Button type="submit" disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
