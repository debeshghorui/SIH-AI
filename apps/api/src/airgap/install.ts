import { createRequire } from "node:module";
import pino from "pino";
import { isLoopbackUrl, parseDest } from "./allow";
import { record } from "./log";

const log = pino({ name: "airgap" });

export class AirgapBlockedError extends Error {
  constructor(readonly dest: string) {
    super(`air-gap: blocked ${dest}`);
    this.name = "AirgapBlockedError";
  }
}

let installed = false;

function destString(url: URL): string {
  return `${url.origin}${url.pathname}${url.search}`;
}

function gate(input: Parameters<typeof fetch>[0]): URL {
  let url: URL;
  try {
    url = parseDest(input);
  } catch {
    record(
      {
        at: new Date().toISOString(),
        dest: String(input),
        allowed: false,
        reason: "invalid-url",
      },
      { loopback: false },
    );
    log.warn({ dest: String(input) }, "air-gap refuse");
    throw new AirgapBlockedError(String(input));
  }

  const dest = destString(url);
  const loopback = isLoopbackUrl(url);
  if (!loopback) {
    record(
      {
        at: new Date().toISOString(),
        dest,
        allowed: false,
        reason: "non-loopback",
      },
      { loopback: false },
    );
    log.warn({ dest }, "air-gap refuse");
    throw new AirgapBlockedError(dest);
  }

  record(
    { at: new Date().toISOString(), dest, allowed: true },
    { loopback: true },
  );
  return url;
}

export function installAirgap(): void {
  if (installed) return;
  installed = true;

  const inner = globalThis.fetch.bind(globalThis) as typeof fetch;
  const wrapped = (async (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
    gate(input);
    return inner(input, init);
  }) as typeof fetch;
  // Preserve any static members (e.g. preconnect) from the original fetch.
  Object.assign(wrapped, inner);
  globalThis.fetch = wrapped;

  try {
    const require = createRequire(import.meta.url);
    const undici = require("undici") as { fetch: typeof fetch };
    undici.fetch = globalThis.fetch;
  } catch {
    // bun: no undici package; global fetch wrap is the interceptor
  }
}
