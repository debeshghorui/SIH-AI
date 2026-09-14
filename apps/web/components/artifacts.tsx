"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
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
        <CardDescription>Downloads from the Express vault.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-(--card-spacing)">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No artifacts yet. Run the inspection beat to generate
            approval_note.docx.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(item.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
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
                  variant="outline"
                  size="icon-sm"
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
            </div>
          ))
        )}
        {deleteMutation.isError ? (
          <p className="text-xs text-destructive">
            Delete failed: {deleteMutation.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
