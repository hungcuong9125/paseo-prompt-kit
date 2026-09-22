import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { ActionPack } from "../../shared/action-registry/schema.js";
import type { ActionSummary } from "../../shared/rpc.js";
import { enabledActions } from "../actions/enabled.js";
import { createWebComposerAdapter } from "../composer-bridge/web.js";
import { createRewriteRunner } from "../pills/rewrite-runner.js";
import { createSettingsReader, type SettingsRead } from "../settings/read-settings.js";

export const REWRITE_COMMAND = "rewrite";

export interface RewriteCommandDependencies {
  listActions: (customActions: readonly ActionPack[]) => Promise<readonly ActionSummary[]>;
  readSettings: () => Promise<SettingsRead>;
}

/**
 * `/rewrite <prompt>` (Desktop/Web). Workspace scope so a draft seat (no agent
 * yet) has it; hence agentId is null and "current agent model" refuses. Native
 * mobile has no Composer DOM: the pill opens a sheet there instead.
 */
export function registerRewriteCommand(
  client: PluginClientContext,
  dependencies: RewriteCommandDependencies,
): () => void {
  return client.addSlashCommand({
    name: REWRITE_COMMAND,
    description: "Rewrite the prompt with PromptKit and put the result back in the Composer",
    argumentHint: "<prompt>",
    context: "workspace",
    async onSubmit(context) {
      const adapter = createWebComposerAdapter();
      if (!adapter.isSupported()) {
        throw new Error("On mobile, press the PromptKit pill instead.");
      }
      const settings = await dependencies.readSettings();
      if (settings.status !== "ready") throw new Error(settings.error);
      const actions = await dependencies.listActions(settings.values.customActions);
      // Default flow = first enabled action.
      const action = enabledActions(actions, settings.values)[0];
      if (action === undefined) {
        throw new Error("No PromptKit action is enabled. Enable one in PromptKit settings.");
      }
      const runner = createRewriteRunner({
        adapter,
        rpc: context.rpc,
        readSettings: createSettingsReader(context.rpc),
        agentId: null,
        workspaceId: context.workspace.id,
        isActive: () => true,
      });
      await runner.runText(action.id, context.args);
    },
  });
}
