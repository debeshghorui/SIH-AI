"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiDelete, apiGet } from "@/lib/query/api";

type Artifact = { name: string; size: number; mtime: string };

export function Artifacts() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
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
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Artifacts</CardTitle>
        <CardDescription>
          Uploads and generated files in the Express vault.
        </CardDescription>
        {items.length > 0 && (
          <CardAction>
            <Badge variant="outline">{items.length}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="max-h-64 overflow-y-auto pt-(--card-spacing)">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Attach a PDF or scan in chat — it lands here. Inspect a scan to
            also generate approval_note.docx.
          </p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => (
              <li
                key={item.name}
                className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(item.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
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
                      if (!window.confirm(`Delete ${item.name} from the vault?`)) {
                        return;
                      }
                      deleteMutation.mutate(item.name);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {deleteMutation.isError ? (
          <p className="pt-2 text-xs text-destructive">
            Delete failed: {deleteMutation.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
