import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import {
  isDedicatedSelectionComplete,
  promptKitSettings,
  promptKitSettingsSchema,
  type PromptKitSettings,
} from "../../shared/settings.js";

export type SettingsRead =
  | { status: "ready"; values: PromptKitSettings }
  | { status: "invalid"; error: string };

type Rpc = PluginClientContext["rpc"];

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads the persisted settings through the host settings API. Every failure —
 * unreadable document, schema mismatch, or an incomplete dedicated selection —
 * is reported as `invalid` so the rewrite path refuses instead of falling back
 * to the current model.
 */
export function createSettingsReader(rpc: Rpc): () => Promise<SettingsRead> {
  const read = settingsRpc(promptKitSettings.id).read;
  return async () => {
    try {
      const result = await rpc(read, {});
      if (result.status !== "ready") return { status: "invalid", error: result.error };
      const parsed = promptKitSettingsSchema.safeParse(result.values);
      if (!parsed.success) {
        return { status: "invalid", error: "PromptKit settings are invalid." };
      }
      if (parsed.data.modelMode === "dedicated" && !isDedicatedSelectionComplete(parsed.data)) {
        return {
          status: "invalid",
          error: "Select a dedicated provider and model in PromptKit settings.",
        };
      }
      return { status: "ready", values: parsed.data };
    } catch (error) {
      return { status: "invalid", error: message(error) };
    }
  };
}
