const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function parseDest(input: Parameters<typeof fetch>[0]): URL {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(raw);
}

export function isLoopbackUrl(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return LOOPBACK.has(host);
}
