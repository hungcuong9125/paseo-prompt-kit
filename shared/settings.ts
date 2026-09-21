import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { CLI_FAMILY_IDS } from "./cli-families.js";

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
  /**
   * Maps a Paseo provider id to the CLI family that runs it. Paseo names a
   * built-in provider after its CLI (`pi`, `codex`) and a custom profile after
   * the role it plays (`pi-peer`, `codex-lead`), so the leading segment resolves
   * most ids without an entry here. An entry is needed only for a profile whose
   * id does not mention its CLI, and an unknown id fails closed either way.
   */
  providerCli: z.record(z.string(), z.enum(CLI_FAMILY_IDS)).default({}),
  timeoutMs: z.number().int().min(1_000).max(600_000).default(90_000),
  /**
   * Per-action user toggle, keyed by action id. An id absent here falls back to
   * the pack's `enabledByDefault`, so a newly added pack is usable without a
   * settings migration and a removed pack leaves no stale state behind.
   */
  actionEnabled: z.record(z.string(), z.boolean()).default({}),
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
