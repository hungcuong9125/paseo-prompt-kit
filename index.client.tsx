import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createWebComposerAdapter } from "./client/composer/web.js";
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
  const removePills = registerAgentPills(client, (agent, isActive) => {
    const runner = createRewriteRunner({
      adapter: createWebComposerAdapter(),
      rpc: client.rpc,
      readSettings,
      agentId: agent.agentId,
      workspaceId: agent.workspaceId,
      isActive,
    });
    return (actionId) => runner.run(actionId);
  });

  const removeSettingsScreen = client.addSettingsScreen({
    id: "prompt-kit",
    title: "PromptKit",
    icon: "Sparkles",
    Component: PromptKitSettingsScreen,
  });

  return () => {
    removePills();
    removeSettingsScreen();
  };
}

export type { PluginClientContext };
