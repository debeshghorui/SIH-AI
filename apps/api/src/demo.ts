import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installAirgap } from "./airgap/install";
import { shutdownSandbox } from "./tools/sandbox";

installAirgap();

const { listen } = await import("./server");
await listen();

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
const child = spawn("bun", ["run", "start"], {
  cwd: webDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

const shutdown = async () => {
  child.kill("SIGTERM");
  await shutdownSandbox();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
