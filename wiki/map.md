# File map

Create files **only** on this map. If you need a new top-level folder, add it here first.

```
apps/api/src/query/        rewrite, step-back, decompose, HyDE
apps/api/src/router/       store + model + tools + reason
apps/api/src/retrieve/     SQL, sqlite-vec, FTS5, files
apps/api/src/agent/        ReAct loop, SSE events
apps/api/src/tools/        fs, isolated-vm, tesseract, docx
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

Status: `apps/web` is a workbench shell. `apps/api` is still a placeholder.

When you add a real module, append one line under **Created** and date it.

## Created

- 2026-09-14 — `apps/web` Next.js App Router, shadcn/ui, TanStack Query (`lib/query`), workbench (chat, trace, meter, artifacts)
- 2026-09-14 — `models.yaml` (registry only, no loader)
