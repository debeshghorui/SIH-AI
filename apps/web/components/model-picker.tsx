"use client";

import { useEffect, useState } from "react";
import { ChevronDownIcon, Cpu } from "lucide-react";
import {
  ANSWER_MODEL_IDS,
  isAnswerModelId,
  useModels,
  type AnswerModelId,
} from "@/lib/query/models";
import { answerModelLabel } from "@/lib/model-labels";

export type PreferChoice = "auto" | AnswerModelId;

export const PREFER_STORAGE_KEY = "workbench.preferModel";

const FALLBACK_MODELS = ANSWER_MODEL_IDS.map((id) => ({ id }));

export function readStoredPrefer(): PreferChoice {
  if (typeof window === "undefined") return "auto";
  const raw = window.localStorage.getItem(PREFER_STORAGE_KEY);
  if (raw === "auto") return "auto";
  if (raw && isAnswerModelId(raw)) return raw;
  return "auto";
}

export function writeStoredPrefer(value: PreferChoice) {
  window.localStorage.setItem(PREFER_STORAGE_KEY, value);
}

export function usePreferModel(): [
  PreferChoice,
  (value: PreferChoice) => void,
] {
  const [value, setValue] = useState<PreferChoice>("auto");
  useEffect(() => {
    setValue(readStoredPrefer());
  }, []);
  const update = (next: PreferChoice) => {
    writeStoredPrefer(next);
    setValue(next);
  };
  return [value, update];
}

type ModelPickerProps = {
  value: PreferChoice;
  onChange: (value: PreferChoice) => void;
  disabled?: boolean;
};

export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const { data: models } = useModels();
  const options = models && models.length > 0 ? models : FALLBACK_MODELS;

  const displayLabel =
    value === "auto"
      ? "Auto"
      : isAnswerModelId(value)
        ? answerModelLabel(value)
        : value;

  return (
    <div className="relative flex items-center">
      <Cpu
        className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground"
        aria-hidden
      />
      <select
        aria-label="Preferred model"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "auto" || isAnswerModelId(next)) onChange(next);
        }}
        className="h-8 max-w-[8rem] cursor-pointer appearance-none rounded-md border-0 bg-transparent py-0 pr-7 pl-8 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:bg-muted/70 focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[9rem] sm:text-sm"
        title={displayLabel}
      >
        <option value="auto">Auto</option>
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {isAnswerModelId(model.id)
              ? answerModelLabel(model.id)
              : model.id}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}
