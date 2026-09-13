# Decisions

Do not re-argue these unless the user explicitly reopens them.

## D1 — TypeScript only

User stack is JS. Python sidecar is a cut, including “just for OCR”.

## D2 — Express agent + Next.js UI (not a Next monolith)

~~Fastify + Vite, Next never used.~~ User chose Express and a Next app.

- **Express** (`apps/api`) owns agent, Ollama, SQLite, sandbox, air-gap, SSE.
- **Next.js** (`apps/web`) is the workbench only: shadcn/ui + TanStack Query.
- No Next Route Handlers / Server Actions that talk to Ollama or SQLite.
- Native addons stay in Express. Next rewrites `/api/*` → `http://127.0.0.1:8787/*`.

## D3 — Custom ReAct, not LangChain.js

Router and trace must be visible. An 80-line loop is the product. LangGraph hides the scoring surface.

## D4 — One SQLite file, not S3 / Chroma / Postgres

`data/plant.sqlite` = plant SQL + sqlite-vec + FTS5. Files live in `data/vault/`. Matches the diagram (auth-db, vector-store, s3) without leaving the box.

## D5 — Official `ollama` package, not `openai` with a local base URL

A local base URL still makes it easy to leak a cloud key. Use `ollama` only.

## D6 — Coding beat is JavaScript

Sandbox is `isolated-vm` (Docker Node image as fallback). Tests use `node:test`.

## D7 — Hard Word template

7B models ramble. Agent fills slots in a `docx` template. Artifact name is always `approval_note.docx`.

## D8 — bun

All installs and scripts: `bun`. Not npm, pnpm, or yarn.
