import type { Response } from "express";
import type { AgentEvent } from "./events";

/**
 * Write an `AgentEvent` to an Express response as one SSE frame:
 *   event: <type>\r\n
 *   data: <json>\r\n
 *   \r\n
 */
export function writeEvent(res: Response, event: AgentEvent): void {
  res.write(`event: ${event.type}\r\n`);
  res.write(`data: ${JSON.stringify(event)}\r\n\r\n`);
}

/**
 * Drain an async iterator of `AgentEvent` into an SSE response. Ends the
 * response when the iterator finishes or throws. If the client disconnects
 * (close event), the caller's abort signal should let the generator stop.
 */
export async function pipeEvents(
  res: Response,
  events: AsyncIterable<AgentEvent>,
): Promise<void> {
  try {
    for await (const event of events) {
      writeEvent(res, event);
    }
  } catch (err) {
    writeEvent(res, {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (!res.writableEnded) res.end();
  }
}
