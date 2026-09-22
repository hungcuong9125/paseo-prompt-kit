import type { PluginClientContext } from "@getpaseo/plugin/client";
import { actionsListRpc } from "./shared/rpc.js";
import { createWebComposerAdapter } from "./client/composer-bridge/web.js";
import { PLUGIN_ICON } from "./client/icon.js";
import { createSettingsReader } from "./client/settings/read-settings.js";
import { registerAgentPills } from "./client/pills/agent-pills.js";
import { createRewriteRunner } from "./client/pills/rewrite-runner.js";
import { PromptKitSettingsScreen } from "./client/settings/settings-screen.js";

/**
 * PromptKit's client contribution: one Composer pill per live agent plus the
 * settings screen. Returns a cleanup that removes every registration.
 */
// Declared, not re-exported: the host snapshots the CJS export table eagerly, before a
// module-scope `var` for a re-exported binding would have been assigned.
export default function contribute(client: PluginClientContext): () => void {
  const readSettings = createSettingsReader(client.rpc);
  const listActions = async () => {
    const output = await client.rpc(actionsListRpc, {});
    // Fail closed on a malformed registry instead of registering a pill with an
    // unknown enabled set.
    if (!Array.isArray(output.actions)) {
      throw new Error("prompt-kit.actions.list returned no action list");
    }
    return output.actions;
  };

  const removePills = registerAgentPills(
    client,
    (agent, isActive) => {
      const runner = createRewriteRunner({
        adapter: createWebComposerAdapter(),
        rpc: client.rpc,
        readSettings,
        agentId: agent.agentId,
        workspaceId: agent.workspaceId,
        isActive,
      });
      return (actionId) => runner.run(actionId);
    },
    { listActions, readSettings },
  );

  const removeSettingsScreen = client.addSettingsScreen({
    id: "prompt-kit",
    title: "PromptKit",
    icon: PLUGIN_ICON,
    Component: PromptKitSettingsScreen,
  });

  return () => {
    removePills();
    removeSettingsScreen();
  };
}

export type { PluginClientContext };
