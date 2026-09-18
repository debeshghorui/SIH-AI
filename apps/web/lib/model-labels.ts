import type { AnswerModelId } from "@/lib/query/models";

const LABELS: Record<AnswerModelId, string> = {
  nano: "Router",
  chat: "Chat",
  coder: "Coder",
};

export function answerModelLabel(id: AnswerModelId): string {
  return LABELS[id];
}
