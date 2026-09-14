# Memory (living)

Last updated: 2026-09-14

Agents: **read this first**. After a material change, add a line under Changelog. Do not delete locked facts. Strike them and write the replacement.

## Phase

`full-roadmap` — Sovereign workbench end-to-end. Express on `127.0.0.1:8787` with air-gap, full ReAct agent (`route → retrieve → generate` with citations, streaming `plan`/`route`/`observe`/`token`/`done` SSE), query translation + router on the nano model, sqlite-vec + FTS5 retrieval, vault-scoped fs tool, OCR/vision (qwen2.5vl:3b), `approval_note.docx` writer, agentic inspection beat (`POST /inspect`), Docker sandbox (`POST /sandbox`, `--network=none`). **All beats run; air-gap `outbound: 0`.** Docker daemon must be running at the venue for the coding beat to execute (degrades gracefully if down).

## Exists

- `AGENTS.md` — agent entry
- `wiki/*` — problem, architecture, stack, decisions, demo, map
- `.cursor/rules/*` — always-on + api/web globs
- `.cursor/skills/sovereign-workbench/` — read-wiki-first skill
- `models.yaml` — registry (loaded by code)
- `data/` — `plant.sqlite` (seeded: 3 tags, 3 inspections, 16 KB chunks vectorized + FTS5), `kb/*.md` SOPs, `samples/` (tank_levels.csv, parseLevels.test.ts, inspection_scan.png, pid_c3.png), `vault/` (uploads + generated docx)
- `vendor/eng.traineddata.gz` — vendored for offline tesseract (currently unused; vision model carries OCR)
- `apps/web` — Next.js App Router (UI only), shadcn/ui, TanStack Query workbench shell
- `apps/api` — Express on `127.0.0.1:8787`, `installAirgap()`, `GET /airgap/events`, `GET /models`, `GET /ollama/health`, `POST /chat` (SSE ReAct), `POST /inspect` (SSE inspection beat), `POST /upload`, `POST /sandbox`, `GET /artifacts`, `GET /artifacts/:name`
- `apps/api/src/models/` — `models.yaml` loader (zod) + `ollama` client pinned to `127.0.0.1:11434` + health probe
- `apps/api/src/query/` — `translate.ts` (rewrite/step-back/decompose/HyDE on nano model)
- `apps/api/src/router/` — `router.ts` (store+model+tools+reason decision on nano model)
- `apps/api/src/retrieve/` — `db.ts` (bun:sqlite + drizzle + sqlite-vec + FTS5), `schema.ts`, `embed.ts`, `retrieve.ts` (SQL + vector + FTS5 + rank top-5), `seed.ts`
- `apps/api/src/agent/` — `events.ts`, `loop.ts` (`runAgent` full ReAct), `inspect.ts` (OCR/vision → findings → docx), `sse.ts`
- `apps/api/src/tools/` — `fs.ts` (vault-scoped, path-traversal guard), `registry.ts` (search/fs/ocr/sandbox/docx), `ocr/index.ts`, `docx/writer.ts`, `sandbox/index.ts` (dockerode)
- `apps/web` — chat (streams + attachment upload + inspect trigger), trace (live route/plan/observe via bus), meter, artifacts (list + download)
- Root `package.json` workspaces (`apps/web`, `apps/api`); `bun run web`, `bun run api`, `bun run demo`

## Does not exist (do not pretend it does)

- ~~Express server, air-gap interceptor~~
- ~~Ollama client wrapper~~ — `apps/api/src/models/client.ts` (official `ollama` npm, host `127.0.0.1:11434`), `models.yaml` loader, `GET /models`, `GET /ollama/health`. SQLite DB, sqlite-vec index
- ~~Agent loop~~ — full ReAct in `apps/api/src/agent/loop.ts` (`runAgent`: translate → route → retrieve → generate with citations, emits plan/route/observe/token/done)
- ~~SQLite DB, sqlite-vec index, router, tools, sandbox, OCR, docx writer~~ — all built
- Sample PDFs / SOPs — **now created** under `data/kb/` and `data/samples/`
- Cloud or Python anything

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
- Coding beat language: **JavaScript/TypeScript**. ~~`isolated-vm` (Docker fallback).~~ **Docker-first** via `dockerode` `node:22-alpine --network=none` (isolated-vm cannot load under Bun/JSC).
- Word output: npm `docx`, artifact name `approval_note.docx`.
- New models: `models.yaml` + zod. Not a code rewrite.

## Open questions

- Venue GPU VRAM (assume 12 GB until told otherwise).
- Whether Docker is available at the venue (sandbox degrades gracefully if down; start Docker Desktop for the coding beat).

## Changelog

- 2026-09-14 — Artifacts delete: `vaultDelete` + `DELETE /artifacts/:name`; web trash button with confirm. `vaultList` hides `.gitkeep` and non-files; download URLs encoded.
- 2026-09-14 — Attachment routing: summary/Q&A uses `/chat` with `attachmentName` (PDF text via pdfjs injected into agent context); inspection beat only when message matches inspect intent. PDFs skip broken Ollama vision pass when text layer exists.
- 2026-09-14 — Fix inspect/chat SSE abort: `req.on("close")` fired after the JSON body was read, aborting before inspect summary tokens; use `res.on("close")` when `!res.writableEnded`. Web inspect SSE parser flushes trailing buffer; chat clears streaming state after inspect.
- 2026-09-14 — Stack corrections (phase 0): SQL layer is now `drizzle-orm` + `bun:sqlite` (not better-sqlite3 native addon — V8 addon cannot load under Bun). Sandbox is Docker-first via `dockerode` `node:22-alpine --network=none`; `isolated-vm` dropped (V8 addon, cannot dlopen under Bun/JSC). Updated wiki/stack.md SQL + Sandbox rows, wiki/decisions.md D6, wiki/map.md tools row, locked facts in memory.md.
- 2026-09-14 — Phase 1 (data layer): `apps/api/src/retrieve/` — `db.ts` (bun:sqlite + drizzle-orm/bun-sqlite + sqlite-vec load via Homebrew libsqlite3 on macOS, FTS5 virtual table), `schema.ts` (tags, inspections, kb_chunks), `embed.ts` (nomic-embed-text), `seed.ts` (idempotent: 3 tags, 3 inspections, KB chunks → vec + FTS). Deps: drizzle-orm, sqlite-vec. Verified: 16 KB chunks vectorized, FTS5 ranked snippets.
- 2026-09-14 — Phase 2 (query + router): `apps/api/src/query/translate.ts` (rewrite/step-back/decompose/HyDE on qwen2.5:1.5b), `apps/api/src/router/router.ts` (store+model+tools+reason JSON decision on nano model, zod-validated, graceful fallback). `loadRegistry()` now called at boot in `listen()`.
- 2026-09-14 — Phase 3 (retrieve + rank): `apps/api/src/retrieve/retrieve.ts` — SQL path (exact tag regex + loose), sqlite-vec cosine (vec0 MATCH, distance → score), FTS5 fallback when best vector score < 6, files stub, top-5 merge + dedup.
- 2026-09-14 — Phase 4 (full ReAct): `apps/api/src/agent/loop.ts` upgraded to `runAgent` (translate → route → retrieve → generate with citations injected, streams plan/route/observe/token/done). `POST /chat` uses `runAgent` + `hasAttachment`. Web: `trace-bus.ts` pub/sub, `trace.tsx` renders live route/plan/observe, `chat.tsx` forwards trace events + attachment upload + inspect trigger. Verified via HTTP: plan→route→observe→123 tokens→done, `outbound: 0`.
- 2026-09-14 — Phase 5 (fs + tools): `apps/api/src/tools/fs.ts` (vault-scoped read/write/list, path-traversal guard rejects `..`/absolute), `registry.ts` (search wraps retrieve, fs/ocr/sandbox/docx stubs). Verified: traversal blocked, search returns SQL citations.
- 2026-09-14 — Phase 6 (OCR + vision): `apps/api/src/tools/ocr/index.ts` — pdfjs-dist text-layer extraction for PDFs, tesseract.js for images (wrapped in 15s timeout — worker thread crashes Bun on bad input, so images skip tesseract and use vision), `describeImage` via qwen2.5vl:3b (raw base64 to Ollama `images` field). Deps: pdfjs-dist, tesseract.js. `vendor/eng.traineddata.gz` vendored.
- 2026-09-14 — Phase 7 (docx artifact): `apps/api/src/tools/docx/writer.ts` — `approval_note.docx` template (title, tag, prepared-by, summary, findings table, recommendation, sign-off) via `docx` npm. Routes `GET /artifacts`, `GET /artifacts/:name`. Web `artifacts.tsx` lists + downloads. Dep: docx. Verified: 9 KB valid Word 2007+ file downloadable.
- 2026-09-14 — Phase 8 (agentic inspection beat): `apps/api/src/agent/inspect.ts` (`runInspect`: OCR/vision → structure findings via chat model → SQL pull → write docx → stream summary), `POST /upload` (raw body → vault), `POST /inspect` (SSE). Web `inspect.ts` (`uploadToVault` + `streamInspect`). Verified: 9.5s end-to-end, docx written, `outbound: 0`.
- 2026-09-14 — Phase 9 (Docker sandbox): `apps/api/src/tools/sandbox/index.ts` — dockerode `node:22-alpine --network=none`, CPU/mem caps, 20s hard timeout, AutoRemove. `POST /sandbox` route. Deps: dockerode, @types/dockerode. Degrades gracefully when Docker daemon down (returns `ok: false`, no crash). Pre-pull `node:22-alpine` at the venue.
- 2026-09-14 — Phase 10 (sample pack): `data/kb/{sop_isolation,sop_leak_test,sop_permit_to_work}.md`, `data/samples/tank_levels.csv` + `parseLevels.test.ts` (node:test), synthetic `inspection_scan.png` + `pid_c3.png` (hand-rendered PNGs with text). Re-seeded `plant.sqlite`: 16 KB chunks vectorized + FTS5.
- 2026-09-14 — Phase 11 (rehearsal): All 4 beats via HTTP in one shell. Beat 1 (SOP) plan+route+observe+123 tokens+done. Beat 2 upload ✓. Beat 3 inspect → `approval_note.docx` (9 KB) written. Beat 4 sandbox graceful-fail (Docker down). **Air-gap `outbound: 0`.** `bun run demo` starts Express + Next.

- 2026-09-14 — Added `apps/api/src/agent/`: `events.ts` (zod SSE schema — `token`/`done`/`error` emitted now, `plan`/`observe`/`route` forward-declared), `loop.ts` (`runChat` async generator streams `ollama().chat` on `getModel("chat")` = `qwen2.5:7b-instruct`, yields `AgentEvent`), `sse.ts` (`writeEvent`/`pipeEvents`). Wired `POST /chat` in `server.ts`: zod-validated `{messages:[{role,content}]}`, SSE headers, abort on client close. Web: `apps/web/lib/query/chat.ts` (`streamChat` POST + manual SSE frame parser), `apps/web/components/chat.tsx` now streams tokens with a cursor, Stop button, error styling (replaced "Express is not running yet" stub). Verified: tokens stream, `done` event arrives, 400 on empty messages, air-gap logs `/api/chat` as allowed loopback, `outbound: 0`.
- 2026-09-14 — Added `apps/api/src/models/`: `schema.ts` (zod registry, duplicate-id refinement), `registry.ts` (`Bun.YAML` load of repo-root `models.yaml`, cached, `getModel`/`modelsForSkill`/`residentModels`), `client.ts` (`ollama` singleton, `OLLAMA_HOST = http://127.0.0.1:11434`, `listLocalTags()` with `:latest` normalization), `health.ts` (`ollamaHealth()` — reachable + per-model present + missing). Wired `GET /models`, `GET /ollama/health`; boot probe warns (not throws) on unreachable/missing. Air-gap log split into allowed + refused rings so loopback polling can't evict refusals. Added deps `ollama`, dev `bun-types`; tsconfig `types: ["node", "bun-types"]`. Verified: `outbound: 0`, all 5 tags present.
- 2026-09-14 — Local Ollama pack confirmed: `qwen2.5:1.5b`, `qwen2.5:7b-instruct`, `qwen2.5vl:3b`, `nomic-embed-text`, `qwen2.5-coder:7b`. Registry vision tag `qwen2-vl:2b` → `qwen2.5vl:3b` (library 404).
- 2026-09-14 — Scaffolded Express in `apps/api`: bind `127.0.0.1:8787`, `installAirgap()` wraps fetch, `GET /airgap/events`, `bun run demo` builds Next then starts Express + `next start`. Meter 0 loopback.
- 2026-09-14 — Scaffolded `apps/web`: Next.js App Router, shadcn/ui, TanStack Query. Rewrites `/api/*` → Express `:8787`. No Google fonts. Express still missing.
- 2026-09-14 — Stack change: bun; Express API; Next.js UI with shadcn/ui + TanStack Query. Fastify + Vite dropped. Still no application code.
- 2026-09-14 — Created wiki, memory, Cursor rules, project skill, and `models.yaml`.
