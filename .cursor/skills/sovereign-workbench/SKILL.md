---
name: sovereign-workbench
description: Navigate the SIH 26117 sovereign workbench without scanning the repo or inventing stack. Use at the start of any task in this project, when adding features, routing, Ollama, RAG, sandbox, air-gap, or demo beats.
---

# Sovereign workbench

## Start

Read in this order. Stop when you have the answer.

1. `wiki/memory.md` — phase, exists / does not exist, locked facts
2. `wiki/INDEX.md` — which one extra page to open
3. That one page only (`architecture`, `stack`, `demo`, `map`, or `decisions`)
4. Code under the path `wiki/map.md` names for this task

Do not glob the whole repo to discover architecture. Do not assume Fastify, Vite, Python, LangChain, or OpenAI exist.

## Build

- API in `apps/api` (Express). UI in `apps/web` (Next + shadcn + TanStack Query).
- Package manager: bun. Packages from `wiki/stack.md` only.
- Air-gap: no non-loopback HTTP. Official `ollama` client only. Next does not host the agent.
- After a material change: changelog `wiki/memory.md`, path on `wiki/map.md`.

## Demo beats (do not invent others)

A SOP RAG · B scan → `approval_note.docx` · C JS sandbox · D P&ID vision · meter at 0

## More

- Scoring: `wiki/problem.md`
- Allow-list: `wiki/stack.md`
- Why Express + Next UI-only: `wiki/decisions.md`
