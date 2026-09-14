import { installAirgap } from "./airgap/install";

installAirgap();

const { listen } = await import("./server");
await listen();
