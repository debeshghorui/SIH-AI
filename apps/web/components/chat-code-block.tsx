"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  highlightCode,
  tokensToLines,
  type TokenKind,
} from "@/lib/highlight";

type ChatCodeBlockProps = {
  code: string;
  language: string;
  filename?: string;
  closed?: boolean;
};

const KIND_CLASS: Record<TokenKind, string> = {
  plain: "text-foreground",
  comment: "text-code-comment italic",
  keyword: "text-code-keyword",
  string: "text-code-string",
  tag: "text-code-tag",
  attr: "text-code-attr",
  number: "text-code-number",
  punct: "text-code-punct",
};

export function ChatCodeBlock({
  code,
  language,
  filename,
}: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const label = [filename, language].filter(Boolean).join(" · ") || "code";
  const lines = useMemo(
    () => tokensToLines(highlightCode(code, language)),
    [code, language],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/25">
      <div className="flex items-center justify-between gap-2 border-b border-border/80 bg-muted/40 px-3 py-1.5">
        <span className="font-mono text-[0.7rem] text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={copied ? "Copied" : "Copy code"}
          onClick={copy}
        >
          {copied ? (
            <Check data-icon="inline-start" />
          ) : (
            <Copy data-icon="inline-start" />
          )}
        </Button>
      </div>
      <pre className="max-h-96 overflow-auto bg-background/60 p-3 font-mono text-[0.8125rem] leading-6">
        <code className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
          {lines.map((line, index) => (
            <span key={index} className="contents">
              <span className="select-none text-right text-muted-foreground/60">
                {index + 1}
              </span>
              <span className="min-w-0 whitespace-pre-wrap break-all">
                {line.length === 0
                  ? "\u00a0"
                  : line.map((token, tokenIndex) => (
                      <span
                        key={tokenIndex}
                        className={KIND_CLASS[token.kind]}
                      >
                        {token.text}
                      </span>
                    ))}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
