# Memory (living)

Last updated: 2026-09-14

Agents: **read this first**. After a material change, add a line under Changelog. Do not delete locked facts. Strike them and write the replacement.

## Phase

`web-scaffold` — Next.js UI exists in `apps/web`. **Express agent host is not scaffolded yet.**

## Exists

- `AGENTS.md` — agent entry
- `wiki/*` — problem, architecture, stack, decisions, demo, map
- `.cursor/rules/*` — always-on + api/web globs
- `.cursor/skills/sovereign-workbench/` — read-wiki-first skill
- `models.yaml` — registry (not loaded by code yet)
- Empty placeholders: `apps/api/`, `data/`, `vendor/`
- `apps/web` — Next.js App Router (UI only), shadcn/ui, TanStack Query workbench shell
- Root `package.json` workspaces (`apps/web`); start UI with `bun run web`

## Does not exist (do not pretend it does)

- Express server, Ollama client wrapper, SQLite DB, sqlite-vec index, air-gap interceptor
- Agent loop, tools, sandbox, OCR, `docx` writer
- Sample PDFs / SOPs (listed in `demo.md`, not created)
- Cloud or Python anything

## Locked facts

- Problem ID: **26117**. Org: **MRPL**. Theme: Smart Automation.
- Package manager: **bun**.
- Stack: TypeScript, **Express** (`apps/api`), **Next.js App Router** (`apps/web`) with **shadcn/ui** + **TanStack Query**.
- ~~Fastify (`apps/api`), Vite + React (`apps/web`).~~
- Next is UI only. No Route Handlers / Server Actions to Ollama or SQLite.
- Inference: Ollama HTTP `127.0.0.1:11434` via official `ollama` npm package.
- Stores: one SQLite file (`data/plant.sqlite`) for SQL + sqlite-vec + FTS5. Files on disk in `data/vault/`.
- Default GPU pack: 12 GB — Qwen2.5-1.5B (router), Qwen2.5-7B-Instruct (chat), Qwen2-VL-2B (vision), Qwen2.5-Coder-7B (swap), nomic-embed-text.
- Coding beat language: **JavaScript/TypeScript** in `isolated-vm` (Docker fallback).
- Word output: npm `docx`, artifact name `approval_note.docx`.
- New models: `models.yaml` + zod. Not a code rewrite.

## Open questions

- Venue GPU VRAM (assume 12 GB until told otherwise).
- Whether Docker is available at the venue (keep `isolated-vm` as primary).

## Changelog

- 2026-09-14 — Scaffolded `apps/web`: Next.js App Router, shadcn/ui, TanStack Query. Rewrites `/api/*` → Express `:8787`. No Google fonts. Express still missing.
- 2026-09-14 — Stack change: bun; Express API; Next.js UI with shadcn/ui + TanStack Query. Fastify + Vite dropped. Still no application code.
- 2026-09-14 — Created wiki, memory, Cursor rules, project skill, and `models.yaml`.
