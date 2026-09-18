"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/query/api";

/** Registry ids that can generate a chat answer. Vision and embed are excluded. */
export const ANSWER_MODEL_IDS = ["nano", "chat", "coder"] as const;
export type AnswerModelId = (typeof ANSWER_MODEL_IDS)[number];

export type ModelEntry = {
  id: string;
  ollama: string;
  skills: string[];
  resident: boolean;
};

export type ModelRegistry = {
  models: ModelEntry[];
};

export function isAnswerModelId(id: string): id is AnswerModelId {
  return (ANSWER_MODEL_IDS as readonly string[]).includes(id);
}

export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: () => apiGet<ModelRegistry>("/api/models"),
    staleTime: 60_000,
    select: (data) => data.models.filter((model) => isAnswerModelId(model.id)),
  });
}
