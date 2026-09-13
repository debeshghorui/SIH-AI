"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/query/api";

export type AirgapEvent = {
  at: string;
  dest: string;
  allowed: boolean;
  reason?: string;
};

export type AirgapSnapshot = {
  outbound: number;
  events: AirgapEvent[];
  online: boolean;
};

export function useAirgapEvents() {
  return useQuery({
    queryKey: ["airgap", "events"],
    queryFn: async (): Promise<AirgapSnapshot> => {
      try {
        const data = await apiGet<Omit<AirgapSnapshot, "online">>(
          "/api/airgap/events",
        );
        return { outbound: data.outbound, events: data.events, online: true };
      } catch {
        return { outbound: 0, events: [], online: false };
      }
    },
    refetchInterval: (query) => (query.state.data?.online ? 4_000 : 15_000),
  });
}
