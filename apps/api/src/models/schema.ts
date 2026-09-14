import { z } from "zod";

/**
 * One row in models.yaml. `skills` is intentionally `string[]` so a new
 * YAML row can advertise a new skill without a code change here.
 */
export const modelSchema = z.object({
  id: z.string().min(1),
  ollama: z.string().min(1),
  skills: z.array(z.string().min(1)).default([]),
  resident: z.boolean().default(true),
});

export const registrySchema = z
  .object({
    models: z.array(modelSchema).min(1),
  // Top-level comments in the YAML are dropped by the parser; only the
  // `models` array is meaningful. Unknown keys are stripped by default.
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const model of value.models) {
      if (seen.has(model.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate model id: ${model.id}`,
          path: ["models"],
        });
        return;
      }
      seen.add(model.id);
    }
  });

export type ModelEntry = z.infer<typeof modelSchema>;
export type Registry = z.infer<typeof registrySchema>;
