"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatCodeBlock } from "@/components/chat-code-block";
import { cn } from "@/lib/utils";

type ChatMarkdownProps = {
  text: string;
  error?: boolean;
};

const prose = "text-[0.9375rem] leading-7 text-foreground/95";

function buildComponents(error?: boolean): Components {
  return {
    p: ({ children }) => (
      <p className={cn("mb-3 last:mb-0", prose, error && "text-destructive")}>
        {children}
      </p>
    ),
    h1: ({ children }) => (
      <h1
        className={cn(
          "mb-2 mt-4 first:mt-0 text-base font-semibold tracking-tight",
          error && "text-destructive",
        )}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        className={cn(
          "mb-2 mt-4 first:mt-0 text-sm font-semibold tracking-tight",
          error && "text-destructive",
        )}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={cn(
          "mb-2 mt-3 first:mt-0 text-sm font-semibold",
          error && "text-destructive",
        )}
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="mb-1.5 mt-2 first:mt-0 text-sm font-medium">{children}</h4>
    ),
    ul: ({ children }) => (
      <ul className={cn("mb-3 list-disc space-y-1 pl-5", prose)}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className={cn("mb-3 list-decimal space-y-1 pl-5", prose)}>
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-6">{children}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ href, children }) => (
      <a
        href={href}
        className="font-medium text-foreground underline underline-offset-2"
        target="_blank"
        rel="noreferrer"
      >
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote
        className={cn(
          "mb-3 border-l-2 border-border pl-3 text-muted-foreground",
          prose,
        )}
      >
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-4 border-border" />,
    table: ({ children }) => (
      <div className="mb-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-border bg-background px-2 py-1 text-left font-medium">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-border px-2 py-1 align-top">{children}</td>
    ),
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
      const match = /language-([\w#+-]+)/.exec(className ?? "");
      const raw = String(children).replace(/\n$/, "");

      if (match) {
        return (
          <ChatCodeBlock code={raw} language={match[1]} closed />
        );
      }

      return (
        <code
          className="rounded-md bg-background/90 px-1 py-0.5 font-mono text-[0.85em] text-foreground ring-1 ring-border/70"
        >
          {children}
        </code>
      );
    },
  };
}

export function ChatMarkdown({ text, error }: ChatMarkdownProps) {
  return (
    <div className="min-w-0 [&>*:first-child]:mt-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={buildComponents(error)}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
