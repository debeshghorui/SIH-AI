"use client";

import { ChatCodeBlock } from "@/components/chat-code-block";
import { splitMessageSegments } from "@/lib/message-segments";

type ChatMessageBodyProps = {
  content: string;
  error?: boolean;
  streaming?: boolean;
};

export function ChatMessageBody({
  content,
  error,
  streaming,
}: ChatMessageBodyProps) {
  const segments = splitMessageSegments(content);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {segments.map((segment, index) => {
        if (segment.type === "code") {
          return (
            <ChatCodeBlock
              key={`code-${index}`}
              code={segment.code}
              language={segment.language}
              closed={segment.closed}
            />
          );
        }

        if (!segment.text.trim()) {
          return null;
        }

        return (
          <p
            key={`text-${index}`}
            className={
              error
                ? "whitespace-pre-wrap text-sm leading-6 text-destructive"
                : "whitespace-pre-wrap text-sm leading-6"
            }
          >
            {segment.text}
          </p>
        );
      })}
      {streaming ? (
        <span className="inline-block h-3.5 w-1.5 animate-pulse rounded-xs bg-muted-foreground/60" />
      ) : null}
    </div>
  );
}
