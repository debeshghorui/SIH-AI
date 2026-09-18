"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Activity, PanelRightClose } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { subscribeTrace, type TraceBusEvent } from "@/lib/query/trace-bus";
import type { StepData, StepStage } from "@/lib/query/chat";

type RouteBadges = {
  store: "sql" | "vector" | "files" | "none";
  model: "nano" | "chat" | "coder" | "vision";
  tools: string[];
  reason: string;
};

type TimelineStep = {
  id: string;
  stage: StepStage | "plan" | "observe";
  title: string;
  detail: string;
  model?: string;
  ollama?: string;
  data?: StepData;
  error?: boolean;
};

const PREVIEW = 400;

const STAGE_LABEL: Record<string, string> = {
  translate: "Query rewrite",
  route: "Router",
  retrieve: "Retrieval",
  tool: "Tool",
  generate: "Generate",
  error: "Error",
  plan: "Plan",
  observe: "Observe",
};

function storeBadgeVariant(
  _store: RouteBadges["store"],
): "secondary" | "outline" {
  return "outline";
}

export function Trace({ onCollapse }: { onCollapse?: () => void }) {
  const [route, setRoute] = useState<RouteBadges | null>(null);
  const [steps, setSteps] = useState<TimelineStep[]>([]);

  useEffect(() => {
    return subscribeTrace((event: TraceBusEvent) => {
      if (event.type === "reset") {
        setRoute(null);
        setSteps([]);
        return;
      }
      if (event.type === "route") {
        setRoute({
          store: event.store,
          model: event.model,
          tools: event.tools,
          reason: event.reason,
        });
        return;
      }
      if (event.type === "step") {
        setSteps((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            stage: event.stage,
            title: event.title,
            detail: event.detail,
            model: event.model,
            ollama: event.ollama,
            data: event.data,
            error: event.stage === "error",
          },
        ]);
        return;
      }
      if (event.type === "plan") {
        setSteps((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            stage: "plan",
            title: "Plan",
            detail: event.thought,
          },
        ]);
        return;
      }
      if (event.type === "observe") {
        setSteps((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            stage: "observe",
            title: `Observe · ${event.tool}`,
            detail: event.result,
            data: { tool: event.tool },
          },
        ]);
        return;
      }
      if (event.type === "error") {
        setSteps((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            stage: "error",
            title: "Error",
            detail: event.message,
            error: true,
          },
        ]);
      }
    });
  }, []);

  const hasRun = Boolean(route || steps.length);

  return (
    <Card className="flex h-full min-h-0 flex-col border-border/50 bg-card/40 shadow-sm">
      <CardHeader className="gap-1 border-b border-border/50 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4 text-muted-foreground" aria-hidden />
          Agent trace
        </CardTitle>
        <CardDescription className="text-xs">
          {hasRun ? "Steps from the current run" : "Send a message to begin"}
        </CardDescription>
        {onCollapse ? (
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Collapse agent trace"
              onClick={onCollapse}
            >
              <PanelRightClose />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pt-(--card-spacing)">
        <ScrollArea className="h-full pr-3">
          {!hasRun ? (
            <p className="text-sm text-muted-foreground">
              Send a message to see translate, router, retrieve scores, and
              which model generated the answer — and why.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {route ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={storeBadgeVariant(route.store)}>
                      Store · {route.store}
                    </Badge>
                    <Badge variant="secondary">Model · {route.model}</Badge>
                    {route.tools.map((tool) => (
                      <Badge key={tool} variant="outline">
                        {tool}
                      </Badge>
                    ))}
                  </div>
                  <p className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs leading-5 text-foreground/90">
                    {route.reason}
                  </p>
                </div>
              ) : null}

              <ol className="flex flex-col gap-3">
                {steps.map((step, index) => (
                  <li key={step.id} className="flex gap-2">
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[0.65rem] font-medium",
                        step.error
                          ? "bg-muted text-muted-foreground ring-1 ring-border"
                          : "bg-muted text-foreground ring-1 ring-border/80",
                      )}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                          {STAGE_LABEL[step.stage] ?? step.stage}
                        </p>
                        {step.data?.guarded ? (
                          <Badge variant="outline">guarded</Badge>
                        ) : null}
                        {step.data?.usedFts ? (
                          <Badge variant="outline">FTS5</Badge>
                        ) : null}
                        {step.data?.usedHyde ? (
                          <Badge variant="outline">HyDE</Badge>
                        ) : null}
                        {step.data?.parseFallback ? (
                          <Badge variant="outline">fallback</Badge>
                        ) : null}
                      </div>
                      <p
                        className={
                          step.error
                            ? "text-xs font-medium text-destructive"
                            : "text-xs font-medium"
                        }
                      >
                        {step.title}
                      </p>
                      {step.ollama || step.model ? (
                        <p className="font-mono text-[0.65rem] text-muted-foreground">
                          {[step.model, step.ollama].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                      <Expandable text={step.detail} error={step.error} />
                      {step.data?.rewritten ? (
                        <Field label="rewritten">{step.data.rewritten}</Field>
                      ) : null}
                      {step.data?.stepBack ? (
                        <Field label="step-back">{step.data.stepBack}</Field>
                      ) : null}
                      {step.data?.subQueries?.length ? (
                        <Field label="sub-queries">
                          {step.data.subQueries.join("\n")}
                        </Field>
                      ) : null}
                      {step.data?.hyde ? (
                        <Field label="HyDE">
                          <Expandable text={step.data.hyde} />
                        </Field>
                      ) : null}
                      {step.data?.queries?.length ? (
                        <Field label="searched">
                          {step.data.queries.join("\n")}
                        </Field>
                      ) : null}
                      {step.data?.citations?.length ? (
                        <ul className="space-y-1.5">
                          {step.data.citations.map((c, i) => (
                            <li
                              key={`${c.source}-${c.heading ?? ""}-${i}`}
                              className="rounded-md bg-muted/50 px-2 py-1.5"
                            >
                              <p className="font-mono text-[0.65rem] text-muted-foreground">
                                {c.kind} · {c.source}
                                {c.heading ? ` · ${c.heading}` : ""} ·{" "}
                                {c.score.toFixed(1)}
                              </p>
                              <Expandable text={c.snippet} />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="whitespace-pre-wrap text-xs leading-5 text-foreground/90">
        {children}
      </div>
    </div>
  );
}

function Expandable({ text, error }: { text: string; error?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = text.length > PREVIEW;
  const shown = open || !long ? text : `${text.slice(0, PREVIEW)}…`;
  return (
    <div className="space-y-1">
      <p
        id={id}
        className={
          error
            ? "whitespace-pre-wrap text-xs leading-5 text-destructive"
            : "whitespace-pre-wrap text-xs leading-5 text-foreground/90"
        }
      >
        {shown}
      </p>
      {long ? (
        <button
          type="button"
          className="text-[0.65rem] font-medium text-muted-foreground underline-offset-2 hover:underline"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
