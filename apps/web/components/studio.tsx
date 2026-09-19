"use client";

import { useEffect, useRef, useState } from "react";
import { FileCode, PanelLeft, PanelLeftClose, Play, Save, Trash2 } from "lucide-react";
import { SandboxOutput } from "@/components/sandbox-output";
import { StudioEditor } from "@/components/studio-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useDeleteProjectFile,
  useProjectTree,
  useSaveProjectFile,
} from "@/lib/query/project";
import {
  runProjectSandbox,
  stopPreview,
  useSandboxHealth,
  type SandboxResponse,
} from "@/lib/query/sandbox";

const FILES_KEY = "studio.files.collapsed";

function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "py") return "python";
  if (ext === "ts" || ext === "mts") return "typescript";
  if (ext === "js" || ext === "mjs") return "javascript";
  if (ext === "md") return "markdown";
  return ext;
}

export function Studio({ conversationId }: { conversationId: string | null }) {
  const { data: files = [], isLoading } = useProjectTree(conversationId);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SandboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const { data: health } = useSandboxHealth();
  const saveFile = useSaveProjectFile(conversationId);
  const deleteFile = useDeleteProjectFile(conversationId);

  useEffect(() => {
    setDraft(null);
  }, [selected, conversationId]);

  useEffect(() => {
    if (window.localStorage.getItem(FILES_KEY) === "1") {
      setFilesCollapsed(true);
    }
  }, []);

  function toggleFiles() {
    setFilesCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(FILES_KEY, next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    if (!selected && files[0]) setSelected(files[0].path);
    if (selected && files.length > 0 && !files.some((f) => f.path === selected)) {
      setSelected(files[0]?.path ?? null);
    }
  }, [files, selected]);

  const selectedFile = files.find((f) => f.path === selected);
  const disk = selectedFile?.content;
  const content = draft ?? disk ?? "";
  const dirty = draft !== null && draft !== (disk ?? "");
  const language = selected ? langFromPath(selected) : "txt";

  const hasHtml = files.some((f) => f.path === "index.html");
  const hasScript = files.some((f) => /\.(js|mjs|ts|mts|py)$/i.test(f.path));
  const dockerUp = health?.dockerUp === true;
  const nginxReady = health?.images?.["nginx:alpine"] === true;
  const nodeReady = health?.images?.["node:22-alpine"] === true;
  const pyReady = health?.images?.["python:3.12-alpine"] === true;
  const pythonOnly =
    hasScript &&
    files.some((f) => f.path.endsWith(".py")) &&
    !files.some((f) => /\.(js|mjs|ts|mts)$/i.test(f.path));

  const hint = !dockerUp
    ? "Docker is down — start Docker Desktop, then Preview or Run."
    : pythonOnly && !pyReady
      ? "python:3.12-alpine is missing. Run bun run sandbox:prepull, then Run."
      : hasScript && !pythonOnly && !nodeReady
        ? "node:22-alpine is missing. Run bun run sandbox:prepull, then Run."
        : hasHtml && !nginxReady
          ? "nginx:alpine is missing. Run bun run sandbox:prepull, then Preview."
          : "Preview serves the folder. Run executes JS/TS/Python in --network=none.";

  async function save() {
    if (!selected || draft === null || disk === undefined) return;
    await saveFile.mutateAsync({ path: selected, content: draft });
    setDraft(null);
  }

  async function run(mode: "preview" | "run") {
    if (!conversationId || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setElapsedMs(null);
    const started = performance.now();
    try {
      if (dirty && selected && draft !== null) {
        await saveFile.mutateAsync({ path: selected, content: draft });
        setDraft(null);
      }
      const next = await runProjectSandbox({
        conversationId,
        mode,
        signal: controller.signal,
      });
      setElapsedMs(Math.round(performance.now() - started));
      setResult(next);
    } catch (err) {
      setElapsedMs(Math.round(performance.now() - started));
      setError(
        controller.signal.aborted
          ? "Stopped."
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setRunning(false);
    }
  }

  async function handleStopPreview(id: string) {
    try {
      await stopPreview(id);
    } catch {
      // gone
    }
    setResult((prev) =>
      prev?.kind === "preview"
        ? { ...prev, ok: false, stderr: "preview stopped", previewUrl: "" }
        : prev,
    );
  }

  const empty = !conversationId || (!isLoading && files.length === 0);

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card/40 shadow-sm"
      aria-label="Project studio"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Project</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            Files for this chat · sandbox runs the folder
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {hasHtml ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!dockerUp || running || empty}
              onClick={() => void run("preview")}
            >
              Preview
            </Button>
          ) : null}
          {hasScript ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!dockerUp || running || empty}
              onClick={() => void run("run")}
            >
              <Play data-icon="inline-start" />
              Run
            </Button>
          ) : null}
        </div>
      </div>

      {empty ? (
        <p className="px-4 py-6 text-sm leading-relaxed text-muted-foreground">
          Ask chat for HTML, CSS, JS, or Python files. They land here, stay
          linked, and Preview or Run uses Docker. React/npm projects are not
          scaffolded offline.
        </p>
      ) : (
        <div
          className={
            filesCollapsed
              ? result?.kind === "preview" && result.ok
                ? "grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(16rem,0.9fr)]"
                : "grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(7rem,0.55fr)]"
              : result?.kind === "preview" && result.ok
                ? "grid min-h-0 flex-1 grid-cols-[minmax(7.5rem,9.5rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(16rem,0.9fr)]"
                : "grid min-h-0 flex-1 grid-cols-[minmax(7.5rem,9.5rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(7rem,0.55fr)]"
          }
        >
          {filesCollapsed ? null : (
            <ScrollArea className="min-h-0 border-r border-border/60">
              <ul className="flex flex-col p-1.5">
                {files.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      className={
                        selected === file.path
                          ? "flex w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-left font-mono text-[0.7rem]"
                          : "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-[0.7rem] text-muted-foreground hover:bg-muted/50"
                      }
                      onClick={() => setSelected(file.path)}
                    >
                      <FileCode className="size-3.5 shrink-0" />
                      <span className="truncate">{file.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}

          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2 py-1">
              <div className="flex min-w-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={filesCollapsed ? "Show files" : "Hide files"}
                  aria-expanded={!filesCollapsed}
                  onClick={toggleFiles}
                >
                  {filesCollapsed ? <PanelLeft /> : <PanelLeftClose />}
                </Button>
                <span className="truncate font-mono text-[0.7rem] text-muted-foreground">
                  {selected ?? "—"}
                </span>
              </div>
              <div className="flex gap-1">
                {dirty ? <Badge variant="secondary">unsaved</Badge> : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={!dirty || saveFile.isPending || !selected}
                  onClick={() => void save()}
                >
                  <Save data-icon="inline-start" />
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={!selected || deleteFile.isPending}
                  onClick={() => {
                    if (!selected) return;
                    void deleteFile.mutateAsync(selected);
                  }}
                >
                  <Trash2 data-icon="inline-start" />
                </Button>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden bg-background/60">
              {selected && disk !== undefined ? (
                <StudioEditor
                  path={selected}
                  value={content}
                  language={language}
                  onChange={setDraft}
                  onBlurSave={() => {
                    if (dirty) void save();
                  }}
                  onSave={() => void save()}
                />
              ) : (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Select a file to edit.
                </p>
              )}
            </div>
          </div>

          <div className="col-span-full min-h-0 overflow-auto border-t border-border/60 p-2">
            {running || result || error ? (
              <SandboxOutput
                language={hasHtml && result?.kind === "preview" ? "html" : language}
                running={running}
                result={result}
                error={error}
                elapsedMs={elapsedMs}
                onStop={() => abortRef.current?.abort()}
                onStopPreview={(id) => void handleStopPreview(id)}
              />
            ) : (
              <p className="px-1 py-2 text-xs text-muted-foreground">{hint}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
