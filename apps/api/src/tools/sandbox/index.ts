import Docker from "dockerode";
import { z } from "zod";

/**
 * Sandbox tool. Runs JavaScript in a disposable Docker container:
 *   docker run --rm --network=none node:22-alpine node -e "<user code>"
 *
 * The container has no network (air-gap enforced by Docker too), a hard
 * CPU/memory cap, and a short timeout. Communication is stdin/stdout JSON:
 *   request  -> { code: string, tests?: string }
 *   response <- { ok: boolean, stdout: string, stderr: string, exitCode: number }
 *
 * `node:test` is available inside the container for the coding beat's
 * fail-then-pass demo.
 */

const IMAGE = "node:22-alpine";
const CPU_QUOTA = 50_000; // 50% of one core
const MEM_LIMIT = 256 * 1024 * 1024; // 256 MB
const TIMEOUT_MS = 20_000;

export const sandboxInputSchema = z.object({
  code: z.string().min(1),
  tests: z.string().optional(),
});

export type SandboxInput = z.infer<typeof sandboxInputSchema>;

export interface SandboxResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

let docker: Docker | null = null;
function client(): Docker {
  if (!docker) docker = new Docker();
  return docker;
}

/**
 * Run `code` (and optional `tests` appended) inside a fresh container.
 * `tests`, if provided, is written to /tmp/test.mjs and run with
 * `node --test` after the main code. Returns captured stdout/stderr.
 */
export async function runSandbox(input: SandboxInput): Promise<SandboxResult> {
  const parsed = sandboxInputSchema.parse(input);
  const testBlock = parsed.tests
    ? `\nimport { test } from "node:test";\nimport assert from "node:assert";\n${parsed.tests}\n`
    : "";

  // Write the user code + tests to /tmp/program.mjs, then run it.
  const program = `${parsed.code}\n${testBlock}`;
  const runScript = [
    "set -e",
    `cat > /tmp/program.mjs <<'EOFP'`,
    program,
    "EOFP",
    "node /tmp/program.mjs",
  ].join("\n");

  return new Promise<SandboxResult>((resolve) => {
    client().createContainer(
      {
        Image: IMAGE,
        Cmd: ["/bin/sh", "-c", runScript],
        HostConfig: {
          NetworkMode: "none",
          CpuQuota: CPU_QUOTA,
          Memory: MEM_LIMIT,
          AutoRemove: true,
        },
        OpenStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      },
      (err, container) => {
        if (err || !container) {
          resolve({
            ok: false,
            stdout: "",
            stderr: err ? String(err) : "no container",
            exitCode: -1,
            timedOut: false,
          });
          return;
        }
        container.start((startErr) => {
          if (startErr) {
            resolve({
              ok: false,
              stdout: "",
              stderr: String(startErr),
              exitCode: -1,
              timedOut: false,
            });
            return;
          }
          container.attach(
            { stream: true, stdout: true, stderr: true },
            (attachErr, stream) => {
              if (attachErr || !stream) {
                resolve({
                  ok: false,
                  stdout: "",
                  stderr: String(attachErr ?? "no stream"),
                  exitCode: -1,
                  timedOut: false,
                });
                return;
              }
              let stdout = "";
              let stderr = "";
              // Docker's multiplexed attach stream frames each payload as:
              //   [1 byte stream type: 1=stdout, 2=stderr] [3 bytes BE length] [payload]
              // We demux it so stdout/stderr stay clean.
              let leftover = Buffer.alloc(0);
              stream.on("data", (chunk: Buffer) => {
                leftover = Buffer.concat([leftover, chunk]);
                while (leftover.length >= 8) {
                  const streamType = leftover[0];
                  const payloadLen = leftover.readUInt32BE(4);
                  if (leftover.length < 8 + payloadLen) break; // incomplete frame
                  const payload = leftover.subarray(8, 8 + payloadLen).toString("utf8");
                  if (streamType === 2) stderr += payload;
                  else stdout += payload;
                  leftover = leftover.subarray(8 + payloadLen);
                }
              });
              stream.on("end", () => {
                container.wait((waitErr, result) => {
                  const exitCode = result?.StatusCode ?? -1;
                  resolve({
                    ok: exitCode === 0,
                    stdout,
                    stderr,
                    exitCode,
                    timedOut: false,
                  });
                });
              });
              // Hard timeout.
              setTimeout(() => {
                container.kill("SIGKILL", () => {
                  resolve({
                    ok: false,
                    stdout,
                    stderr,
                    exitCode: 137,
                    timedOut: true,
                  });
                });
              }, TIMEOUT_MS);
            },
          );
        });
      },
    );
  });
}
