import { z } from "zod";

export const airgapEventSchema = z.object({
  at: z.string(),
  dest: z.string(),
  allowed: z.boolean(),
  reason: z.string().optional(),
});

export const airgapSnapshotSchema = z.object({
  outbound: z.number().int().nonnegative(),
  events: z.array(airgapEventSchema),
});

export type AirgapEvent = z.infer<typeof airgapEventSchema>;
export type AirgapSnapshot = z.infer<typeof airgapSnapshotSchema>;

const MAX_ALLOWED = 256;
const MAX_REFUSED = 64;

// Two rings: allowed (loopback traffic, including Ollama health polling) and
// refused (non-loopback attempts). Keeping them separate means a flood of
// allowed loopback calls — e.g. the UI polling /ollama/health every few
// seconds — cannot push the more important refused events out of the
// snapshot that the demo's meter panel shows.
const allowed: AirgapEvent[] = [];
const refused: AirgapEvent[] = [];
let outbound = 0;

export function record(
  event: AirgapEvent,
  opts: { loopback: boolean },
): void {
  if (event.allowed) {
    allowed.push(event);
    if (allowed.length > MAX_ALLOWED) allowed.shift();
    // `outbound` counts allowed non-loopback traffic. Under the air-gap
    // policy that number should always be 0; the meter exists to prove it.
    if (!opts.loopback) outbound += 1;
  } else {
    refused.push(event);
    if (refused.length > MAX_REFUSED) refused.shift();
  }
}

export function snapshot(): AirgapSnapshot {
  // Merge both rings, newest first. Refused events are the headline of the
  // demo panel, so they always appear; allowed events fill in around them.
  const events = [...allowed, ...refused].sort((a, b) =>
    b.at.localeCompare(a.at),
  );
  return airgapSnapshotSchema.parse({ outbound, events });
}
