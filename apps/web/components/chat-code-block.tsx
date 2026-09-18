"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Copy, Play } from "lucide-react";
import { SandboxOutput } from "@/components/sandbox-output";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  highlightCode,
  tokensToLines,
  type TokenKind,
} from "@/lib/highlight";
import { isRunnableLanguage } from "@/lib/message-segments";
import {
  runSandbox,
  stopPreview,
  useSandboxHealth,
  type SandboxResponse,
} from "@/lib/query/sandbox";

type ChatCodeBlockProps = {
  code: string;
  language: string;
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
  closed = true,
}: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SandboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewIdRef = useRef<string | null>(null);
  const { data: health } = useSandboxHealth();

  const label = language || "code";
  const runnable = isRunnableLanguage(language);
  const dockerUp = health?.dockerUp === true;
  const imageReady = dockerUp && sandboxImageReady(health?.images, language);
  const canRun = runnable && closed && code.trim().length > 0 && dockerUp;
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

  function stop() {
    abortRef.current?.abort();
  }

  async function handleStopPreview(id: string) {
    try {
      await stopPreview(id);
    } catch {
      // container may already be gone
    }
    previewIdRef.current = null;
    setResult((prev) =>
      prev?.kind === "preview"
        ? { ...prev, ok: false, stderr: "preview stopped", previewUrl: "" }
        : prev,
    );
  }

  async function run() {
    if (!canRun || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setElapsedMs(null);
    const started = performance.now();
    try {
      const next = await runSandbox({
        code,
        language,
        sessionId: "workbench",
        signal: controller.signal,
      });
      setElapsedMs(Math.round(performance.now() - started));
      setResult(next);
      if (next.kind === "preview" && next.ok) {
        previewIdRef.current = next.previewId;
      }
      if (next.kind === "run" && !next.ok && next.stderr && next.exitCode === -1) {
        setError(null);
      }
    } catch (err) {
      setElapsedMs(Math.round(performance.now() - started));
      if (controller.signal.aborted) {
        setResult((prev) => prev);
        setError("Stopped.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
    }
  }

  const tooltip = !closed
    ? "Wait for the code fence to finish streaming"
    : !dockerUp
      ? "Docker daemon not running — start Docker Desktop"
      : !imageReady
        ? "Sandbox image not pulled — run bun run sandbox:prepull"
        : "Run in a disposable Docker container";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
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
      {runnable ? (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canRun || running}
                    onClick={() => void run()}
                  >
                    <Play data-icon="inline-start" />
                    Run on Sandbox
                  </Button>
                </span>
              }
            />
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      {running || result || error ? (
        <SandboxOutput
          language={label}
          running={running}
          result={result}
          error={error}
          elapsedMs={elapsedMs}
          onStop={stop}
          onStopPreview={(id) => void handleStopPreview(id)}
        />
      ) : null}
    </div>
  );
}

function sandboxImageReady(
  images: Record<string, boolean> | undefined,
  language: string,
): boolean {
  if (!images) return false;
  const lang = language.trim().toLowerCase();
  if (lang === "python" || lang === "py") return images["python:3.12-alpine"] === true;
  if (lang === "html" || lang === "css") return images["nginx:alpine"] === true;
  return images["node:22-alpine"] === true;
}
