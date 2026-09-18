# File map

Create files **only** on this map. If you need a new top-level folder, add it here first.

```
apps/api/src/query/        rewrite, step-back, decompose, HyDE
apps/api/src/router/       store + model + tools + reason
apps/api/src/retrieve/     SQL, sqlite-vec, FTS5, files
apps/api/src/agent/        ReAct loop, SSE events
apps/api/src/tools/        fs, sandbox (dockerode), tesseract, docx
apps/api/src/airgap/       fetch patch, event log
apps/api/src/models/       models.yaml loader + zod
apps/web/app/              Next.js App Router pages
apps/web/components/ui/    shadcn/ui
apps/web/lib/query/        TanStack Query hooks to Express
apps/web/components/       workbench: chat, trace, meter, artifacts
data/vault/                uploaded and generated files
data/kb/                   SOP markdown
data/samples/              demo PDFs, images, CSV, tests
vendor/                    vendored OCR / offline weights
models.yaml                registry (repo root)
wiki/                      this wiki
```

Status: `apps/web` is a workbench shell. `apps/api` boots Express + air-gap. Query/router/retrieve/agent/tools/models are not implemented.

When you add a real module, append one line under **Created** and date it.

## Created

- 2026-09-18 — `apps/api/src/chat/sessions.ts`, `apps/api/src/chat/persist.ts`; `apps/web/lib/query/conversations.ts`; `apps/web/components/workbench-sidebar.tsx`. Conversation tables in `schema.ts` / `migrate()`.

- 2026-09-18 — `apps/web/components/chat-markdown.tsx` (GFM prose for chat text segments)
- 2026-09-18 — `apps/web/lib/query/models.ts`; `apps/web/components/model-picker.tsx`; `apps/web/components/ui/select.tsx`. Chat `preferModel` on `POST /chat`.
- 2026-09-18 — `apps/api/scripts/prepull-sandbox.ts`; `apps/web/lib/query/sandbox.ts`; `apps/web/components/sandbox-output.tsx`. Sandbox routes: `GET /sandbox/health`, `DELETE /sandbox/preview/:id`.
- 2026-09-18 — `apps/web/lib/highlight.ts` (offline token colors for chat code fences)
- 2026-09-14 — `apps/web/lib/attachment-intent.ts` (chat vs inspection-beat routing for an attached file)

- 2026-09-14 — `apps/api/src/retrieve/` (`db.ts`, `schema.ts`, `embed.ts`, `retrieve.ts`, `seed.ts`); `apps/api/src/query/translate.ts`; `apps/api/src/router/router.ts`; `apps/api/src/tools/` (`fs.ts`, `registry.ts`, `ocr/index.ts`, `docx/writer.ts`, `sandbox/index.ts`); `apps/api/src/agent/inspect.ts`; routes `POST /inspect`, `POST /upload`, `POST /sandbox`, `GET /artifacts`, `GET /artifacts/:name`; web `lib/query/inspect.ts`, `lib/query/trace-bus.ts`, `trace.tsx` live, `artifacts.tsx` list+download, `chat.tsx` attachment+inspect; `data/kb/*.md`, `data/samples/*`, `vendor/eng.traineddata.gz`; `data/plant.sqlite` seeded
- 2026-09-14 — `apps/api/src/agent/` (`events.ts`, `loop.ts`, `sse.ts`); `POST /chat` SSE in `server.ts`; `apps/web/lib/query/chat.ts` (`streamChat`); `apps/web/components/chat.tsx` streaming UI
- 2026-09-14 — `apps/api/src/models/` (`schema.ts`, `registry.ts`, `client.ts`, `health.ts`); `GET /models`, `GET /ollama/health` in `server.ts`; air-gap log split rings in `src/airgap/log.ts`
- 2026-09-14 — `apps/api` Express boot (`src/index.ts`, `src/server.ts`, `src/demo.ts`), `src/airgap/` fetch wrap + event log, `GET /airgap/events`
- 2026-09-14 — `apps/web` Next.js App Router, shadcn/ui, TanStack Query (`lib/query`), workbench (chat, trace, meter, artifacts)
- 2026-09-14 — `models.yaml` (registry only, no loader)
