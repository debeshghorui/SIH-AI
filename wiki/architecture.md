# Architecture

Two processes. Express is the only process that talks to Ollama.

```
Browser (Next.js + shadcn + TanStack Query)
    → Next :3000  (UI only; rewrites /api → Express)
        → Express :8787
            → query translate (nano: rewrite / step-back / decompose / HyDE)
            → router (store + model + tools + reason; keyword store guard)
            → retrieve (SQL | sqlite-vec | FTS5 fallback; skip when store=none)
            → generate (chat/coder/nano; preferModel overrides answer model only)
            → Ollama 127.0.0.1:11434
            → tools (vault fs, dockerode sandbox, tesseract/pdfjs, docx)
            → air-gap: deny non-loopback, log every refuse
```

Dev: Next `:3000` rewrites `/api/*` → Express `:8787`.  
Venue: `bun run demo` starts Express + `next start`. Open `:3000`. Browser never calls Ollama.

SSE: `step` (append-only timeline) + `route` (badges) + `token` / `done` / `error`. Traces are not stored in SQLite.

## Router outputs (must be visible in the UI trace)

- `store`: `sql` | `vector` | `files` | `none`
- `model`: `nano` | `chat` | `coder` | `vision`
- `tools`: subset of `fs` | `ocr` | `sandbox` | `docx` | `search`
- `reason`: one sentence (append store-guard / preferModel when they fire)

`preferModel` from the composer changes the generate model only. Store and tools stay with the router.

## Query pipeline

Translate (per-task nano prompts, no few-shots, Jaccard drop of paraphrase sub-queries, plant-SOP / `setTimeout` leak guard) → route (+ `guardStore`) → retrieve unique rewrite/step-back/sub-queries (HyDE embedded on the vector path only; plant stores skipped when `store: none`) → rank top-5 → generate with numbered citations. If best vector score &lt; 6, FTS5 keyword fallback.

Vault files: upload writes `data/vault/`. PDF extract reads every page (text layer, else raster → tesseract → vision). Images run tesseract first, then vision if OCR is empty or a short caption. Extracted text is chunked into `vault_chunks` + sqlite-vec + FTS5. `retrieveFiles` searches that index plus filenames. An attached document is injected into generate and skips plant SOP stores. Follow-ups like “this pic” reuse the last `[attachment: name]` chip unless that extract is thin (then OCR runs again). “Give me the text” answers quote the extract verbatim. The composer does not show a sticky file bar; the user bubble shows a filename pill.

## Air-gap layers

1. `installAirgap()` wraps `fetch` / undici at Express boot.
2. UI meter on `GET /api/airgap/events` (rewritten to Express). Green when `outbound: 0`.
3. Airplane mode / unplugged cable at the venue.
