# Agent entry

Read these **before** searching the repo or writing code:

1. [wiki/INDEX.md](wiki/INDEX.md) — map and reading order
2. [wiki/memory.md](wiki/memory.md) — living facts (what exists, what is locked)
3. Then **only** the one wiki page you need (`architecture`, `stack`, `demo`, `decisions`)

Do **not** scan `apps/`, `node_modules`, or the whole tree to learn the project. If a fact is missing, say so and update `wiki/memory.md` after you confirm it.

## Locked (do not reopen)

- SIH problem **26117** — sovereign on-prem agentic workbench for MRPL
- Language: **TypeScript only**. No Python.
- Package manager: **bun**
- Shape: **Express API** + **Next.js UI** (shadcn/ui + TanStack Query). Next is not the agent host.
- Models: **Ollama on 127.0.0.1 only**. No cloud LLM SDKs.
- Venue ship: `bun run demo` starts Express + Next. Next rewrites `/api` to Express.
- Air-gap is a product requirement. Non-loopback HTTP is a bug.

## After you change something material

Append a dated note to [wiki/memory.md](wiki/memory.md). If you add a module, add one line to [wiki/map.md](wiki/map.md). Do not invent packages that are not in [wiki/stack.md](wiki/stack.md).
