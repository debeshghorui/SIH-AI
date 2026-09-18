"use client";

import { useQuery } from "@tanstack/react-query";
import { apiDelete, apiGet } from "@/lib/query/api";

export type SandboxLimits = {
  image: string;
  network: string;
  cpu: string;
  mem: string;
  timeout: string;
};

export type SandboxRunResult = {
  kind: "run";
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  aborted: boolean;
  image: string;
  limits: SandboxLimits;
};

export type SandboxPreviewResult = {
  kind: "preview";
  ok: boolean;
  previewUrl: string;
  previewId: string;
  expiresAt: string;
  stderr: string;
  image: string;
  limits: SandboxLimits;
};

export type SandboxResponse = SandboxRunResult | SandboxPreviewResult;

export type SandboxHealth = {
  dockerUp: boolean;
  images: Record<string, boolean>;
  error?: string;
};

export async function getSandboxHealth(): Promise<SandboxHealth> {
  try {
    return await apiGet<SandboxHealth>("/api/sandbox/health");
  } catch {
    return { dockerUp: false, images: {}, error: "Express unreachable" };
  }
}

export function useSandboxHealth() {
  return useQuery({
    queryKey: ["sandbox", "health"],
    queryFn: getSandboxHealth,
    refetchInterval: (query) => (query.state.data?.dockerUp ? 15_000 : 8_000),
  });
}

export async function runSandbox(input: {
  code: string;
  language: string;
  tests?: string;
  sessionId?: string;
  signal?: AbortSignal;
}): Promise<SandboxResponse> {
  const res = await fetch("/api/sandbox", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      code: input.code,
      language: input.language,
      tests: input.tests,
      sessionId: input.sessionId,
    }),
    signal: input.signal,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (data && typeof data === "object" && "kind" in data) {
    return data as SandboxResponse;
  }

  const message =
    data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : `HTTP ${res.status}`;
  return {
    kind: "run",
    ok: false,
    stdout: "",
    stderr: message,
    exitCode: -1,
    timedOut: false,
    aborted: false,
    image: "",
    limits: {
      image: "",
      network: "none",
      cpu: "50%",
      mem: "256MB",
      timeout: "20s",
    },
  };
}

export async function stopPreview(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/sandbox/preview/${encodeURIComponent(id)}`);
}

export function formatSandboxLimits(limits: SandboxLimits): string {
  const parts = [
    limits.image && `image: ${limits.image}`,
    limits.network && `net: ${limits.network}`,
    limits.cpu && `cpu: ${limits.cpu}`,
    limits.mem && `mem: ${limits.mem}`,
    limits.timeout && `timeout: ${limits.timeout}`,
  ].filter(Boolean);
  return parts.join(" · ");
}
