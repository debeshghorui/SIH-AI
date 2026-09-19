"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPut } from "@/lib/query/api";

export type ProjectFile = {
  path: string;
  size: number;
  mtime: string;
  content: string;
};

export function projectQueryKey(conversationId: string | null) {
  return ["project", conversationId] as const;
}

export function useProjectTree(conversationId: string | null) {
  return useQuery({
    queryKey: projectQueryKey(conversationId),
    queryFn: async () => {
      const data = await apiGet<{ items: ProjectFile[] }>(
        `/api/projects/${conversationId}`,
      );
      return data.items;
    },
    enabled: Boolean(conversationId),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useProjectFile(
  conversationId: string | null,
  path: string | null,
) {
  return useQuery({
    queryKey: ["project-file", conversationId, path],
    queryFn: async () => {
      const encoded = path!.split("/").map(encodeURIComponent).join("/");
      return apiGet<{ path: string; content: string }>(
        `/api/projects/${conversationId}/files/${encoded}`,
      );
    },
    enabled: Boolean(conversationId && path),
  });
}

export function useSaveProjectFile(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { path: string; content: string }) => {
      const encoded = input.path.split("/").map(encodeURIComponent).join("/");
      return apiPut<{ ok: boolean; path: string }>(
        `/api/projects/${conversationId}/files/${encoded}`,
        { content: input.content },
      );
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: projectQueryKey(conversationId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-file", conversationId, vars.path],
      });
    },
  });
}

export function useDeleteProjectFile(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      return apiDelete<{ ok: boolean; path: string }>(
        `/api/projects/${conversationId}/files/${encoded}`,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: projectQueryKey(conversationId),
      });
    },
  });
}
