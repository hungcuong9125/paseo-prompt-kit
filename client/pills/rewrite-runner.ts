import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { ComposerAdapter } from "../composer/adapter.js";
import { providerCatalogRpc, rewriteRpc, type ProviderCatalogOutput, type RewriteInput } from "../../shared/rpc.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";
import type { PromptActionId } from "../../shared/actions.js";
import type { SettingsRead } from "../settings/read-settings.js";
import { validateDedicatedSelection } from "../settings/selection.js";

export interface RewriteRunnerInput {
  adapter: ComposerAdapter;
  rpc: PluginClientContext["rpc"];
  readSettings: () => Promise<SettingsRead>;
  agentId: string;
  workspaceId: string;
  /** False once this agent's pill is gone, so a late result is never applied. */
  isActive: () => boolean;
}

export interface RewriteRunner {
  run(actionId: PromptActionId): Promise<void>;
  isBusy(): boolean;
}

/**
 * The rewrite path. Nothing here sends a message or writes outside the visible
 * Composer; every refusal throws the message the host turns into a toast, and
 * the Composer text is replaced only when it still holds the snapshot taken
 * before the request.
 */
export function createRewriteRunner(input: RewriteRunnerInput): RewriteRunner {
  let busy = false;

  async function run(actionId: PromptActionId): Promise<void> {
    if (busy) throw new Error("PromptKit is already rewriting this prompt.");
    const source = input.adapter.readText();
    if (source === null) {
      throw new Error("PromptKit needs one visible Composer.");
    }
    if (source.trim() === "") {
      throw new Error("Write a prompt first.");
    }
    busy = true;
    try {
      const settings = await input.readSettings();
      if (settings.status === "invalid") throw new Error(settings.error);
      if (settings.values.modelMode === "dedicated") {
        const catalog = await input.rpc(providerCatalogRpc, {});
        const selectionError = validateDedicatedSelection(settings.values, catalog.providers);
        if (selectionError !== null) throw new Error(selectionError);
      }
      if (!input.isActive()) {
        throw new Error("This agent is no longer available.");
      }
      const request: RewriteInput = {
        actionId,
        agentId: input.agentId,
        workspaceId: input.workspaceId,
        originalPrompt: source,
        settings: promptKitSettingsSchema.parse(settings.values),
      };
      const output = await input.rpc(rewriteRpc, request);
      if (output.status === "error") throw new Error(output.error.message);
      if (!input.isActive()) {
        throw new Error("This agent is no longer available; your text was kept.");
      }
      if (input.adapter.readText() !== source) {
        throw new Error("The prompt changed while PromptKit was rewriting; your text was kept.");
      }
      if (!input.adapter.replaceText(output.rewrittenPrompt)) {
        throw new Error("PromptKit could not find the Composer to update.");
      }
      input.adapter.focus();
    } finally {
      busy = false;
    }
  }

  return { run, isBusy: () => busy };
}
