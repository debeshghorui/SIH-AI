# Demo

Rehearse until boring. Eight minutes. Airplane mode.

| Time | Action | On screen |
|---|---|---|
| 0:00 | `bun run demo`, cable unplugged | Meter 0. Local models listed |
| 0:40 | SOP question for tag 12-P-104 | Router → chat + vector. Top-5 citations |
| 1:40 | Upload `inspection_scan.png` | Router → vision/OCR. Findings table |
| 3:00 | Agent writes the note | Trace steps. Download `approval_note.docx` |
| 5:00 | Parse tank CSV in JS, write tests, run | Router → coder. Sandbox red then green |
| 6:40 | Network log | Only `127.0.0.1` |
| 7:20 | Open `models.yaml` | New model = a row, not a rewrite |

## Venue

Pre-pull sandbox images once (online or from a cache): `bun run sandbox:prepull` (`node:22-alpine`, `python:3.12-alpine`, `nginx:alpine`). Docker Desktop must be running for the coding beat.

## Sample pack (exists, no MRPL data)

- `data/samples/inspection_scan.png` (synthetic scan; beat 2 uploads this, not a PDF)
- `data/samples/pid_c3.png`
- `data/kb/sop_isolation.md`, `sop_leak_test.md`, `sop_permit_to_work.md`
- `data/plant.sqlite` (3 tags, 3 inspections, KB chunks in vec + FTS5)
- `data/samples/tank_levels.csv`
- `data/samples/parseLevels.test.ts`

## Definition of done

One command. Airplane mode. Four beats in eight minutes. Word opens. Sandbox green. Meter stays 0.
