import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import {
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
 * unreadable document or schema mismatch — is reported as `invalid` so callers
 * refuse instead of falling back to defaults the user never chose.
 *
 * Whether a *dedicated* selection is usable depends on the live provider
 * catalog, so that check belongs to the rewrite path
 * (`validateDedicatedSelection`), not here. Reporting an incomplete selection as
 * an unreadable document would also hide the pill, because the pill's enabled
 * set cannot be computed from a document the reader refuses.
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
      return { status: "ready", values: parsed.data };
    } catch (error) {
      return { status: "invalid", error: message(error) };
    }
  };
}
