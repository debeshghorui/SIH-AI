"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

  const fields = [
    { key: "store", value: trace.store, hint: "sql · vector · files · none" },
    { key: "model", value: trace.model, hint: "nano · chat · coder · vision" },
    { key: "tools", value: trace.tools?.join(", "), hint: "fs · ocr · sandbox · docx · search" },
    { key: "reason", value: trace.reason, hint: "one sentence from the router" },
  ] as const;

  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <CardTitle>Agent trace</CardTitle>
        <CardDescription>
          {trace.reason ? "Live router output." : "No run yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-(--card-spacing)">
        {trace.plan && (
          <div className="rounded-md bg-muted/50 p-2">
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              plan
            </p>
            <p className="mt-1 text-xs leading-5">{trace.plan}</p>
          </div>
        )}
        {fields.map((field, i) => (
          <div key={field.key}>
            {i > 0 || trace.plan ? <Separator className="mb-3" /> : null}
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                {field.key}
              </span>
              <Badge variant={field.value ? "default" : "outline"}>
                {field.value ?? "—"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
          </div>
        ))}
        {trace.observe && (
          <>
            <Separator className="mb-3" />
            <div className="rounded-md bg-muted/50 p-2">
              <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                observe · {trace.observe.tool}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5">
                {trace.observe.result.slice(0, 400)}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
