import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const modelModeSchema = z.enum(["current", "dedicated"]);

/**
 * Host-scoped PromptKit settings. Every field has a default so `{}` parses and
 * an incomplete dedicated selection can never silently select another model.
 */
export const promptKitSettingsSchema = z.object({
  modelMode: modelModeSchema.default("current"),
  dedicatedProvider: z.string().min(1).nullable().default(null),
  dedicatedModel: z.string().min(1).nullable().default(null),
  dedicatedThinkingOptionId: z.string().min(1).nullable().default(null),
  timeoutMs: z.number().int().min(1_000).max(600_000).default(90_000),
});

export type PromptKitSettings = z.output<typeof promptKitSettingsSchema>;

export const promptKitSettings = defineSettings({
  id: "prompt-kit",
  scope: "host",
  version: 1,
  schema: promptKitSettingsSchema,
});

export function isDedicatedSelectionComplete(settings: PromptKitSettings): boolean {
  return settings.dedicatedProvider !== null && settings.dedicatedModel !== null;
}
