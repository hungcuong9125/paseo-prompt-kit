import type {
  PluginButton,
  PluginButtonMenuEntry,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { listPromptActions, type PromptActionId } from "../../shared/actions.js";

export interface AgentPillAgent {
  workspaceId: string;
  agentId: string;
}

export type AgentPillRunner = (actionId: PromptActionId) => Promise<void>;

const PILL_ID = "prompt-kit";

function pillButton(run: AgentPillRunner): PluginButton {
  return {
    title: "PromptKit",
    icon: "Sparkles",
    label: "PromptKit",
    behavior: {
      kind: "menu",
      items: listPromptActions().map(
        (action): PluginButtonMenuEntry => ({
          kind: "item",
          id: action.id,
          title: action.title,
          icon: action.icon,
          behavior: { kind: "action", onPress: () => run(action.id) },
        }),
      ),
    },
  };
}

/**
 * Registers one Composer pill per live agent. The agent snapshot is the only
 * source of the `workspaceId`/`agentId` pair the frozen rewrite RPC requires, so
 * placement follows the agent directory: an agent upsert adds a pill, a remove
 * or archive drops it, and cleanup drops every registration.
 */
export function registerAgentPills(
  client: PluginClientContext,
  createRunner: (agent: AgentPillAgent, isActive: () => boolean) => AgentPillRunner,
): () => void {
  const entries = new Map<
    string,
    { workspaceId: string; registration: PluginButtonRegistration }
  >();

  function remove(agentId: string): void {
    const entry = entries.get(agentId);
    if (!entry) return;
    entry.registration.remove();
    entries.delete(agentId);
  }

  function upsert(agent: AgentPillAgent): void {
    const existing = entries.get(agent.agentId);
    if (existing) {
      if (existing.workspaceId === agent.workspaceId) return;
      remove(agent.agentId);
    }
    const isActive = () =>
      entries.get(agent.agentId)?.workspaceId === agent.workspaceId;
    const registration = client.addComposerPill({
      id: PILL_ID,
      workspaceId: agent.workspaceId,
      agentId: agent.agentId,
      button: pillButton(createRunner(agent, isActive)),
    });
    entries.set(agent.agentId, { workspaceId: agent.workspaceId, registration });
  }

  function accept(agent: {
    id: string;
    workspaceId?: string | undefined;
    archivedAt?: string | null | undefined;
  }): void {
    if (agent.archivedAt || !agent.workspaceId) {
      remove(agent.id);
      return;
    }
    upsert({ workspaceId: agent.workspaceId, agentId: agent.id });
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "upsert") accept(update.agent);
    else remove(update.agentId);
  });

  void client.paseo.agents
    .list({ subscribe: {}, page: { limit: 200 } })
    .then((result) => {
      for (const entry of result.entries) accept(entry.agent);
    })
    .catch((error: unknown) => {
      console.error("[prompt-kit] failed to list agents", error);
    });

  return () => {
    unsubscribe();
    for (const agentId of [...entries.keys()]) remove(agentId);
  };
}
