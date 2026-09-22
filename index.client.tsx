import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { ActionPack } from "./shared/action-registry/schema.js";
import { actionsListRpc } from "./shared/rpc.js";
import { createWebComposerAdapter } from "./client/composer-bridge/web.js";
import { PLUGIN_ICON } from "./client/icon.js";
import { createSettingsReader } from "./client/settings/read-settings.js";
import { onSettingsSaved } from "./client/settings/settings-saved.js";
import { registerRewriteCommand } from "./client/commands/rewrite-command.js";
import { registerAgentPills } from "./client/pills/agent-pills.js";
import { createRewriteRunner } from "./client/pills/rewrite-runner.js";
import { PromptKitSettingsScreen } from "./client/settings/settings-screen.js";
import { createRewriteSheet, locateComposerFromProbe } from "./client/sheet/rewrite-sheet.js";

/**
 * Client contribution: a Composer pill per live agent, the `/rewrite` slash
 * command, and the settings screen. Without a Composer DOM (native mobile) the
 * pill is a popover sheet instead of an in-place rewrite.
 */
// Declared, not re-exported: the host snapshots the CJS export table eagerly, before a
// module-scope `var` for a re-exported binding would have been assigned.
export default function contribute(client: PluginClientContext): () => void {
  const readSettings = createSettingsReader(client.rpc);
  const listActions = async (customActions: readonly ActionPack[]) => {
    const output = await client.rpc(actionsListRpc, { customActions: [...customActions] });
    // Fail closed on a malformed registry instead of registering a pill with an
    // unknown enabled set.
    if (!Array.isArray(output.actions)) {
      throw new Error("prompt-kit.actions.list returned no action list");
    }
    return output.actions;
  };

  const composerSupported = createWebComposerAdapter().isSupported();
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
    {
      listActions,
      readSettings,
      onSettingsSaved,
      ...(composerSupported ? {} : { popover: createRewriteSheet(locateComposerFromProbe) }),
    },
  );

  const removeCommand = registerRewriteCommand(client, { listActions, readSettings });

  const removeSettingsScreen = client.addSettingsScreen({
    id: "prompt-kit",
    title: "Settings",
    icon: PLUGIN_ICON,
    Component: PromptKitSettingsScreen,
  });

  return () => {
    removePills();
    removeCommand();
    removeSettingsScreen();
  };
}

export type { PluginClientContext };
