"use client";

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

  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex rounded-4xl">
        <Badge variant={outbound === 0 ? "outline" : "destructive"}>
          <span className="font-mono tabular-nums">Meter {outbound}</span>
          <span className="text-muted-foreground">
            {online ? "loopback" : isFetching ? "checking" : "Express offline"}
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {online
          ? `${data?.events.length ?? 0} air-gap events from Express`
          : "GET /api/airgap/events rewrites to Express :8787. API is not running yet."}
      </TooltipContent>
    </Tooltip>
  );
}
