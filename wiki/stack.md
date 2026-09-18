# Stack (allow-list)

If a package is not here, **do not add it** without updating this page and `memory.md`.

| Layer | Use | Do not use |
|---|---|---|
| Package manager | bun | npm, pnpm, yarn |
| Language | TypeScript, Node 22 (`bun-types` dev-only for `Bun.YAML`) | Python, FastAPI, Gradio |
| API | Express in `apps/api` (`express`, `@types/express`) | Fastify, Next.js Route Handlers as the agent host |
| UI | Next.js App Router in `apps/web` (`next`, `react`, `react-dom`) | Vite SPA, Gradio, client-side Ollama |
| Components | shadcn/ui (`shadcn`, `@base-ui/react`, `class-variance-authority`, `cn`, `lucide-react`, `tw-animate-css`, Tailwind 4) | random extra component kits |
| Server state | TanStack Query (`@tanstack/react-query`) | SWR, raw `useEffect` + `fetch` for API data |
| LLM | `ollama` npm → `127.0.0.1:11434` | `openai`, groq-sdk, @anthropic-ai/sdk |
| SQL | drizzle-orm + `bun:sqlite` (bun:sqlite client; better-sqlite3 shim not used) | Supabase, Prisma Cloud, better-sqlite3 native addon |
| Vectors | sqlite-vec in `data/plant.sqlite` (loaded via `sqlite-vec` npm into bun:sqlite) | Pinecone, Weaviate, Chroma server |
| Keyword | SQLite FTS5 | Algolia |
| Embeddings | Ollama `nomic-embed-text` | OpenAI embeddings |
| OCR | tesseract.js + pdfjs-dist (vendored traineddata) | Cloud Vision, Python RapidOCR |
| Office | `docx`, exceljs, pptxgenjs | python-docx |
| Sandbox | dockerode `node:22-alpine` / `python:3.12-alpine` `--network=none`; HTML/CSS via `nginx:alpine` bound to `127.0.0.1`. One fresh container per run, SIGTERM then SIGKILL. | `eval()`, unrestricted `child_process`, isolated-vm |
| Config | `models.yaml` + zod | Hard-coded model names |
| Logs | pino | LangSmith, cloud APM |
| Schema | zod | Unvalidated `any` at boundaries |

## Models (12 GB default)

| Role | Ollama tag (planned) | Resident |
|---|---|---|
| nano / router | qwen2.5:1.5b | yes |
| chat | qwen2.5:7b-instruct | yes |
| vision | qwen2.5vl:3b | yes |
| coder | qwen2.5-coder:7b | swapped in for coding beat |
| embed | nomic-embed-text | yes |

8 GB: drop VL, use Tesseract.js only. 16 GB+: keep coder resident.

## Offline

Vendor Tesseract `eng.traineddata` under `vendor/` before the venue. Pre-pull Ollama models. No first-run Hugging Face. `NEXT_TELEMETRY_DISABLED=1`. No `next/font` Google. Local fonts only.
