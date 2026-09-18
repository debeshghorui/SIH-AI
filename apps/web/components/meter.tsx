"use client";

import { cn } from "cn";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAirgapEvents } from "@/lib/query/airgap";

export function Meter() {
  const { data, isFetching } = useAirgapEvents();
  const outbound = data?.outbound ?? 0;
  const online = data?.online === true;
  const secure = online && outbound === 0;

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          "inline-flex max-w-[min(100vw-8rem,14rem)] rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-none",
        )}
      >
        <Badge
          variant="outline"
          className={cn(
            "h-7 gap-1.5 border px-2.5 font-normal tabular-nums shadow-none",
            secure &&
              "border-foreground/15 bg-muted/60 text-foreground [&_svg]:text-foreground/80",
            !secure &&
              outbound > 0 &&
              "border-foreground/30 bg-foreground/5 text-foreground",
          )}
        >
          {secure ? (
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="hidden text-xs font-medium sm:inline">
            {online ? "Air-gap" : isFetching ? "Connecting" : "Offline"}
          </span>
          <span
            className="font-mono text-xs tabular-nums"
            aria-label={`Outbound requests: ${outbound}`}
          >
            {outbound}
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {online
          ? `Outbound HTTP from Express: ${outbound}. ${data?.events.length ?? 0} logged events — loopback only at the venue.`
          : "Cannot reach Express at /api/airgap/events. Start the API with bun run api or bun run demo."}
      </TooltipContent>
    </Tooltip>
  );
}
