# File map

Create files **only** on this map. If you need a new top-level folder, add it here first.

```
apps/api/src/query/        rewrite, step-back, decompose, HyDE (+ translate.test.ts)
apps/api/src/router/       store + model + tools + reason + store guard
apps/api/src/retrieve/     SQL, sqlite-vec, FTS5, vault file index
apps/api/src/agent/        ReAct loop, inspect, SSE (`step`/`route`/`token`/`done`)
apps/api/src/chat/         conversation CRUD + persist on chat `done`
apps/api/src/tools/        fs, sandbox (dockerode), tesseract/pdfjs, docx
apps/api/src/airgap/       fetch patch, event log
apps/api/src/models/       models.yaml loader + zod
apps/web/app/              Next.js App Router pages
apps/web/components/ui/    shadcn/ui
apps/web/lib/query/        TanStack Query hooks to Express
apps/web/components/       workbench: chat, trace, meter, artifacts, sidebar
apps/web/lib/highlight.ts  offline chromatic tokens for code fences
data/vault/                uploaded and generated files
data/kb/                   SOP markdown
data/samples/              demo images, CSV, tests
vendor/                    vendored OCR / offline weights
models.yaml                registry (repo root)
wiki/                      this wiki
```

Status: full workbench. Express + Next UI-only. Query translate, router, retrieve, ReAct SSE, tools, inspect, chat sessions, sample pack. Do not treat modules as missing.

When you add a **new folder or top-level file**, append one line under **Created**. Folders already on the tree need no diary.

## Created

- 2026-09-19 — `apps/api/src/agent/attachment.ts`
- 2026-09-19 — `apps/api/src/retrieve/vault-index.ts`; `apps/api/src/tools/ocr/text.ts`
- 2026-09-19 — `apps/api/src/query/translate.test.ts`; `apps/web/lib/model-labels.ts`
- 2026-09-18 — `apps/api/src/chat/`; sidebar; `preferModel` picker; sandbox prepull; `apps/web/lib/highlight.ts`
