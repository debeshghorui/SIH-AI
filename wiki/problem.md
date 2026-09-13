# Problem 26117

Sovereign on-premise agentic AI workbench using open-weight multimodal LLMs for confidential industrial work. Organization: MRPL.

## Why it exists

Refinery / PSU / defence knowledge work cannot go to Claude or Codex. Data stays on premises. People either work by hand or leak into public tools. Nothing deployable exists that feels like Claude/Codex.

## Judges score this (not model size)

1. **Model auto-select** — at least two task types, visible router reason.
2. **Agentic task** — scanned inspection → findings → `approval_note.docx`.
3. **Coding task** — JS written and run in a sandbox; show fail then pass.
4. **Multimodal** — image or scan understood (P&ID or photo, not only the PDF from beat 2).
5. **Sovereign proof** — live network meter / log, outbound **0**. Airplane mode.

Mid-range GPU is enough. Smaller open-weight models are allowed. Demo data is public samples, not MRPL secrets.

## Not the product

70B/120B, fine-tuning, cloud fallback, SSO, plant historian, mobile, PPT+Excel+Word on every task (one Word file is enough).
