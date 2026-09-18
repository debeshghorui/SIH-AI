"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileDown,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiDelete, apiGet } from "@/lib/query/api";

type Artifact = { name: string; size: number; mtime: string };

function artifactIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return FileText;
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) return FileImage;
  if (/\.(csv|xlsx?)$/.test(lower)) return FileSpreadsheet;
  if (lower.endsWith(".docx")) return FileType;
  return FileText;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Artifacts() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["artifacts"],
    queryFn: async () => {
      const d = await apiGet<{ items: Artifact[] }>("/api/artifacts");
      return d.items;
    },
    refetchInterval: 5_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) =>
      apiDelete<{ ok: true; name: string }>(
        `/api/artifacts/${encodeURIComponent(name)}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["artifacts"] });
    },
  });

  const items = data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border/60 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-sidebar-foreground">Vault</p>
          <p className="text-xs text-muted-foreground">
            Uploads and generated files
          </p>
        </div>
        {items.length > 0 ? (
          <Badge variant="secondary" className="tabular-nums">
            {items.length}
          </Badge>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        {isLoading ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-sm leading-relaxed text-muted-foreground">
            Attach a PDF or scan in chat — files are stored here. Run an
            inspection on a scan to generate{" "}
            <span className="font-mono text-xs">approval_note.docx</span>.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 pb-3">
            {items.map((item) => {
              const Icon = artifactIcon(item.name);
              return (
                <li
                  key={item.name}
                  className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent/70"
                >
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/40 text-muted-foreground group-hover:border-border/60 group-hover:text-foreground"
                    aria-hidden
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(item.size)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Download ${item.name}`}
                      onClick={() => {
                        window.open(
                          `/api/artifacts/${encodeURIComponent(item.name)}`,
                          "_blank",
                        );
                      }}
                    >
                      <FileDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${item.name}`}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(`Delete ${item.name} from the vault?`)
                        ) {
                          return;
                        }
                        deleteMutation.mutate(item.name);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {deleteMutation.isError ? (
          <p className="px-2 pt-2 text-xs text-destructive">
            Delete failed: {deleteMutation.error.message}
          </p>
        ) : null}
      </ScrollArea>
    </div>
  );
}
