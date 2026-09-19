"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatSandboxLimits,
  type SandboxResponse,
} from "@/lib/query/sandbox";

type SandboxOutputProps = {
  language: string;
  running: boolean;
  result: SandboxResponse | null;
  error: string | null;
  elapsedMs: number | null;
  onStop: () => void;
  onStopPreview?: (id: string) => void;
};

function ExitChip({ result }: { result: SandboxResponse }) {
  if (result.kind === "preview") {
    if (!result.ok) {
      return <Badge variant="destructive">preview failed</Badge>;
    }
    return <Badge variant="outline">nginx · loopback</Badge>;
  }
  if (result.timedOut) {
    return <Badge variant="destructive">timed out</Badge>;
  }
  if (result.aborted) {
    return <Badge variant="secondary">stopped</Badge>;
  }
  if (result.exitCode === 0) {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
        exit 0
      </Badge>
    );
  }
  return <Badge variant="destructive">exit {result.exitCode}</Badge>;
}

function StreamBlock({
  label,
  text,
  open,
}: {
  label: string;
  text: string;
  open: boolean;
}) {
  if (!text && !open) return null;
  return (
    <details open={open} className="group">
      <summary className="cursor-pointer list-none font-mono text-[0.7rem] text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="mr-1.5 inline-block transition group-open:rotate-90">▸</span>
        {label}
        <span className="ml-1.5 opacity-60">{text ? `${text.length} chars` : "empty"}</span>
      </summary>
      <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background px-2.5 py-2 font-mono text-xs leading-5 text-foreground">
        {text || "∅"}
      </pre>
    </details>
  );
}

function PreviewFrame({
  result,
  onStopPreview,
}: {
  result: Extract<SandboxResponse, { kind: "preview" }>;
  onStopPreview?: (id: string) => void;
}) {
  const [expired, setExpired] = useState(() => Date.now() >= Date.parse(result.expiresAt));

  useEffect(() => {
    const ms = Date.parse(result.expiresAt) - Date.now();
    if (ms <= 0) {
      setExpired(true);
      return;
    }
    const t = window.setTimeout(() => setExpired(true), ms);
    return () => window.clearTimeout(t);
  }, [result.expiresAt]);

  if (!result.ok) {
    return (
      <p className="px-3 py-2 font-mono text-xs text-destructive">{result.stderr}</p>
    );
  }

  if (expired) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Preview expired. Run again to spin a new nginx container.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => window.open(result.previewUrl, "_blank", "noreferrer")}
        >
          <ExternalLink data-icon="inline-start" />
          Open in new tab
        </Button>
        {onStopPreview ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onStopPreview(result.previewId)}
          >
            <Square data-icon="inline-start" />
            Stop preview
          </Button>
        ) : null}
      </div>
      <iframe
        title="Sandbox HTML preview"
        src={result.previewUrl}
        sandbox="allow-scripts"
        className="block h-[min(24rem,45vh)] w-full rounded-lg border border-border bg-white"
      />
    </div>
  );
}

export function SandboxOutput({
  language,
  running,
  result,
  error,
  elapsedMs,
  onStop,
  onStopPreview,
}: SandboxOutputProps) {
  const limits = result?.limits;
  const trace = limits ? formatSandboxLimits(limits) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[0.7rem] text-muted-foreground">{language}</span>
          {running ? (
            <Badge variant="secondary">running</Badge>
          ) : result ? (
            <ExitChip result={result} />
          ) : error ? (
            <Badge variant="destructive">error</Badge>
          ) : null}
          {elapsedMs !== null ? (
            <span className="font-mono text-[0.7rem] text-muted-foreground tabular-nums">
              {elapsedMs} ms
            </span>
          ) : null}
        </div>
        {running ? (
          <Button type="button" variant="outline" size="xs" onClick={onStop}>
            <Square data-icon="inline-start" />
            Stop
          </Button>
        ) : null}
      </div>

      {running ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          Starting disposable container…
        </p>
      ) : null}

      {error && !running ? (
        <p className="px-3 py-2 font-mono text-xs text-destructive">{error}</p>
      ) : null}

      {result?.kind === "run" && !running ? (
        <div className="flex flex-col gap-2 px-3 py-2">
          <StreamBlock label="stdout" text={result.stdout} open />
          <StreamBlock label="stderr" text={result.stderr} open={Boolean(result.stderr)} />
        </div>
      ) : null}

      {result?.kind === "preview" && !running ? (
        <PreviewFrame result={result} onStopPreview={onStopPreview} />
      ) : null}

      {trace ? (
        <p className="border-t border-border px-3 py-1.5 font-mono text-[0.65rem] leading-4 text-muted-foreground">
          {trace}
        </p>
      ) : null}
    </div>
  );
}
