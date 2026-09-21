import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createWebComposerAdapter } from "./composer/web.js";
import { createSettingsReader } from "./settings/read-settings.js";
import { registerAgentPills } from "./pills/agent-pills.js";
import { createRewriteRunner } from "./pills/rewrite-runner.js";
import { PromptKitSettingsScreen } from "./settings/settings-screen.js";

/**
 * PromptKit's client contribution: one Composer pill per live agent plus the
 * settings screen. Returns a cleanup that removes every registration.
 */
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
