# Memory (living)

Last updated: 2026-09-19

Agents: **read this first**. After a material change, add **one** Changelog line and keep the last ~5. Do not delete locked facts — strike the old line and write the replacement. Pipeline → `architecture.md`. Packages → `stack.md`. Paths → `map.md`.

## Phase

`full-roadmap` — All four demo beats run. Express `127.0.0.1:8787` + Next UI-only. ReAct `translate → route → retrieve → generate` over SSE (`step` / `route` / `token` / `done`). Air-gap `outbound: 0`. Docker must be up at the venue for the coding beat (degrades if down).

## Exists

- Wiki, Cursor rules, `sovereign-workbench` skill, `models.yaml`
- `data/plant.sqlite` (3 tags, 3 inspections, KB vec + FTS5), `data/kb/*.md`, `data/samples/` (CSV, tests, `inspection_scan.png`, `pid_c3.png`), `data/vault/`
- Express: `/airgap/events`, `/models`, `/ollama/health`, `/chat` (SSE, `preferModel`, `conversationId`), `/conversations`, `/inspect`, `/upload`, `/sandbox`, `/artifacts`
- Next workbench: chat, Chat/Files sidebar, hideable trace, meter, Run on Sandbox, model picker
- Scripts: `bun run web` / `api` / `demo` / `sandbox:prepull`

## Does not exist (do not pretend it does)

- Vault keyword retrieve (`retrieveFiles`) — empty stub
- Cloud LLM, Python sidecar, traces in SQLite

## Locked facts

- Problem ID: **26117**. Org: **MRPL**. Theme: Smart Automation.
- Package manager: **bun**.
- Stack: TypeScript, **Express** (`apps/api`), **Next.js App Router** (`apps/web`) with **shadcn/ui** + **TanStack Query**.
- ~~Fastify (`apps/api`), Vite + React (`apps/web`).~~
- Next is UI only. No Route Handlers / Server Actions to Ollama or SQLite.
- Inference: Ollama HTTP `127.0.0.1:11434` via official `ollama` npm package.
- Stores: one SQLite file (`data/plant.sqlite`) for SQL + sqlite-vec + FTS5. Files on disk in `data/vault/`.
- ~~Default GPU pack: 12 GB — Qwen2-VL-2B (vision).~~ Official Ollama dropped `qwen2-vl`. Vision tag is **`qwen2.5vl:3b`**.
- Default GPU pack: 12 GB — Qwen2.5-1.5B (router), Qwen2.5-7B-Instruct (chat), Qwen2.5-VL-3B (vision), Qwen2.5-Coder-7B (swap), nomic-embed-text.
- Coding beat language: **JavaScript/TypeScript**. ~~`isolated-vm` (Docker fallback).~~ **Docker-first** via `dockerode`: one fresh container per run. JS/TS → `node:22-alpine --network=none`; Python → `python:3.12-alpine --network=none`; HTML/CSS → `nginx:alpine` bound to `127.0.0.1`. SIGTERM (2s) then SIGKILL.
- Word output: npm `docx`, artifact name `approval_note.docx`.
- New models: `models.yaml` + zod. Not a code rewrite.

## Preferences (user lock)

Do not reopen unless the user says so.

- **Workbench chrome:** black / gray / white only — header, sidebar, chat shell, user bubbles, trace card. No blue or purple product accents.
- **Code fences:** chromatic syntax highlighting stays (`--code-*` in `apps/web/app/globals.css`, `apps/web/lib/highlight.ts`). Monochrome does **not** apply inside `ChatCodeBlock`.
- **Air-gap meter:** success green when `outbound: 0`, destructive when leaked. Not a gray badge.
- **Answer model picker:** composer `preferModel` (Auto / nano / chat / coder). Router still chooses store + tools; generate honors the picker. Inspect beat unchanged.
- **Nano translate:** per-task prompts, **no few-shots** (1.5b copies examples), no plant-SOP HyDE on non-plant questions, drop paraphrase sub-queries in code.

## Open questions

- Venue GPU VRAM (assume 12 GB until told otherwise).
- Whether Docker is available at the venue (sandbox degrades gracefully if down; start Docker Desktop for the coding beat).

## Changelog

- 2026-09-19 — Compressed memory to current truth (dropped phase diary). Preferences and D9 unchanged.
- 2026-09-19 — Query translate: per-task nano prompts, Jaccard dedupe, domain-leak guard; retrieve unique queries; skip plant stores when `store: none`.
- 2026-09-19 — UI lock: monochrome chrome, chromatic code tokens, green air-gap meter.
- 2026-09-19 — Append-only `step` SSE trace; hideable pane; traces not in SQLite.
- 2026-09-18 — Chat sessions in SQLite; composer `preferModel`; Docker sandbox + Run on Sandbox.
