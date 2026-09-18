"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { subscribeTrace } from "@/lib/query/trace-bus";
import type { AgentEvent } from "@/lib/query/chat";

type TraceState = {
  store?: "sql" | "vector" | "files" | "none";
  model?: "nano" | "chat" | "coder" | "vision";
  tools?: string[];
  reason?: string;
  plan?: string;
  observe?: { tool: string; result: string };
};

export function Trace() {
  const [trace, setTrace] = useState<TraceState>({});

  useEffect(() => {
    return subscribeTrace((event: AgentEvent) => {
      if (event.type === "route") {
        setTrace((t) => ({
          ...t,
          store: event.store,
          model: event.model,
          tools: event.tools,
          reason: event.reason,
        }));
      } else if (event.type === "plan") {
        setTrace((t) => ({ ...t, plan: event.thought }));
      } else if (event.type === "observe") {
        setTrace((t) => ({ ...t, observe: { tool: event.tool, result: event.result } }));
      }
    });
  }, []);

  const hasRun = Boolean(
    trace.plan || trace.reason || trace.store || trace.observe,
  );

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="border-b">
        <CardTitle>Agent trace</CardTitle>
        <CardDescription>
          {hasRun ? "Live from the Express agent loop." : "No run yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pt-(--card-spacing)">
        <ScrollArea className="h-full pr-3">
          {!hasRun ? (
            <p className="text-sm text-muted-foreground">
              Send a message to see which store, model, and tools the router
              picked — and why.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {trace.store && (
                  <Badge variant="secondary">store · {trace.store}</Badge>
                )}
                {trace.model && (
                  <Badge variant="secondary">model · {trace.model}</Badge>
                )}
                {trace.tools?.map((tool) => (
                  <Badge key={tool} variant="outline">
                    {tool}
                  </Badge>
                ))}
              </div>

              {trace.reason && (
                <Section label="reason">{trace.reason}</Section>
              )}
              {trace.plan && <Section label="plan">{trace.plan}</Section>}
              {trace.observe && (
                <Section label={`observe · ${trace.observe.tool}`}>
                  {trace.observe.result.slice(0, 600)}
                </Section>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-xs leading-5 text-foreground/90">
        {children}
      </p>
    </div>
  );
}
