import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: 1,
        refetchOnWindowFocus: false,
        // Workbench is loopback-only. A browser "offline" flag must not
        // pause GET /api/* (otherwise the sidebar and meter stay empty).
        networkMode: "always",
      },
      mutations: {
        networkMode: "always",
      },
    },
  });
}
