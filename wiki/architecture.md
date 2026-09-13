# Architecture

Two processes. Express is the only process that talks to Ollama.

```
Browser (Next.js + shadcn + TanStack Query)
    → Next :3000  (UI only; rewrites /api → Express)
        → Express :8787
            → query translate (1.5B)
            → router (store + model + tools)
            → retrieve (SQL | sqlite-vec | files | FTS5 fallback)
            → agent loop (plan → tool → observe)
            → Ollama 127.0.0.1:11434
            → tools (fs, isolated-vm, tesseract, docx)
            → air-gap: deny non-loopback, log every refuse
```

Dev: Next `:3000` rewrites `/api/*` → Express `:8787`.  
Venue: `bun run demo` starts Express + `next start`. Open `:3000`. Browser never calls Ollama.

## Router outputs (must be visible in the UI trace)

- `store`: `sql` | `vector` | `files` | `none`
- `model`: `nano` | `chat` | `coder` | `vision`
- `tools`: subset of `fs` | `ocr` | `sandbox` | `docx` | `search`
- `reason`: one sentence

## Query pipeline (from the product diagram)

Translate (step-back, rewrite, decompose, HyDE) → route → retrieve/act → rank top-5 → generate. If retrieval score &lt; 6, FTS5 keyword fallback.

## Air-gap layers

1. `installAirgap()` wraps `fetch` / undici at Express boot.
2. UI meter on `GET /api/airgap/events` (rewritten to Express).
3. Airplane mode / unplugged cable at the venue.
