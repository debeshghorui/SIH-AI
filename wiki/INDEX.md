# Wiki index

Source of truth for agents and humans. Short pages on purpose.

| Read | When |
|---|---|
| [memory.md](memory.md) | Every session. What is true **right now**. |
| [problem.md](problem.md) | Scoring rules, four demo beats, what “done” means |
| [architecture.md](architecture.md) | Pipeline, process split, data flow |
| [stack.md](stack.md) | Allowed npm packages. If it is not listed, do not add it. |
| [decisions.md](decisions.md) | Why Express + Next (UI only) + bun + Ollama |
| [demo.md](demo.md) | 8-minute script and sample pack |
| [map.md](map.md) | Where code will live. Create files only on this map. |

## How to navigate (agents)

1. Open `memory.md`. If the answer is there, stop.
2. Open **one** page from the table. Do not open all of them.
3. Open code only for the module you are editing. Paths are in `map.md`.
4. If you invent a library, a folder, or a cloud call, you are wrong. Stop and re-read `stack.md`.

## Out of scope for this folder

- Cursor canvases (session UI only). Facts belong here, not in a canvas.
- Conversation history. Decisions get written into `memory.md` or `decisions.md`.
