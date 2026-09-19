"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  highlightCode,
  tokensToLines,
  type TokenKind,
} from "@/lib/highlight";

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

const FACE =
  "box-border p-3 font-mono text-[0.8125rem] leading-6 [tab-size:4]";

type StudioEditorProps = {
  path: string;
  value: string;
  language: string;
  onChange: (next: string) => void;
  onBlurSave: () => void;
  onSave: () => void;
};

export function StudioEditor({
  path,
  value,
  language,
  onChange,
  onBlurSave,
  onSave,
}: StudioEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const lines = useMemo(
    () => tokensToLines(highlightCode(value, language)),
    [value, language],
  );

  function syncScroll() {
    const area = areaRef.current;
    const pre = preRef.current;
    if (!area || !pre) return;
    pre.scrollTop = area.scrollTop;
    pre.scrollLeft = area.scrollLeft;
  }

  useEffect(() => {
    syncScroll();
  }, [value, language]);

  return (
    <div className="relative h-full min-h-[12rem] overflow-hidden">
      <pre
        ref={preRef}
        aria-hidden
        className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre ${FACE}`}
      >
        <code>
          {lines.map((line, index) => (
            <span key={index} className="block min-h-6">
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
          ))}
        </code>
      </pre>
      <textarea
        ref={areaRef}
        aria-label={`Edit ${path}`}
        className={`absolute inset-0 h-full min-h-[12rem] w-full resize-none overflow-auto border-0 bg-transparent whitespace-pre text-transparent caret-foreground outline-none selection:bg-foreground/20 selection:text-transparent ${FACE}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onBlur={onBlurSave}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            onSave();
          }
        }}
        spellCheck={false}
        wrap="off"
      />
    </div>
  );
}
