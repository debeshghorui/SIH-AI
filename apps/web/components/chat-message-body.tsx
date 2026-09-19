"use client";

import { ChatCodeBlock } from "@/components/chat-code-block";
import { ChatMarkdown } from "@/components/chat-markdown";
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
              filename={segment.filename}
              closed={segment.closed}
            />
          );
        }

        if (!segment.text.trim()) {
          return null;
        }

        return (
          <ChatMarkdown
            key={`text-${index}`}
            text={segment.text}
            error={error}
          />
        );
      })}
      {streaming ? (
        <span className="inline-block h-4 w-1 animate-pulse rounded-full bg-foreground/50" />
      ) : null}
    </div>
  );
}
