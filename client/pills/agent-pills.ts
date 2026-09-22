import type {
  PluginButton,
  PluginButtonMenuEntry,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import type { ActionSummary } from "../../shared/rpc.js";
import { enabledActions } from "../actions/enabled.js";
import { PLUGIN_ICON } from "../icon.js";
import type { SettingsRead } from "../settings/read-settings.js";

export interface AgentPillAgent {
  workspaceId: string;
  agentId: string;
}

export type AgentPillRunner = (actionId: string) => Promise<void>;

export interface AgentPillDependencies {
  /** Loaded actions, from `prompt-kit.actions.list`. */
  listActions: () => Promise<readonly ActionSummary[]>;
  readSettings: () => Promise<SettingsRead>;
}

const PILL_ID = "prompt-kit";

/**
 * Builds the pill for the enabled set `E`.
 *
 * The SDK has no settings-changed event for code outside the React tree, so `E`
 * is read when a pill is registered and a toggle takes effect on the next agent
 * mount or plugin reload. That limitation is recorded, not hidden: the pill is
 * never left in a shape that would run an action the user disabled without
 * knowing, because a stale shape only ever runs an action that was enabled when
 * the pill was built.
 */
export function pillButton(enabled: readonly ActionSummary[], run: AgentPillRunner): PluginButton {
  const first = enabled[0]!;
  const base = {
    title: "PromptKit",
    icon: PLUGIN_ICON,
    label: "PromptKit",
  } as const;

  if (enabled.length === 1) {
    // The icon stays the plugin's, not the action's: the pill and the settings
    // screen title name the same plugin, so they must not show two different
    // icons for it. The title still says which action this pill will run.
    return {
      ...base,
      title: first.title,
      behavior: { kind: "action", onPress: () => run(first.id) },
    };
  }

  const items: readonly PluginButtonMenuEntry[] = enabled.map((action) => ({
    kind: "item",
    id: action.id,
    title: action.title,
    icon: action.icon,
    behavior: { kind: "action", onPress: () => run(action.id) },
  }));
  return { ...base, behavior: { kind: "menu", items } };
}

/**
 * Registers one Composer pill per live agent. The agent snapshot is the only
 * source of the `workspaceId`/`agentId` pair the rewrite RPC requires, so
 * placement follows the agent directory: an agent upsert adds a pill, a remove
 * or archive drops it, and cleanup drops every registration.
 */
export function registerAgentPills(
  client: PluginClientContext,
  createRunner: (agent: AgentPillAgent, isActive: () => boolean) => AgentPillRunner,
  dependencies: AgentPillDependencies,
): () => void {
  const entries = new Map<
    string,
    { workspaceId: string; registration: PluginButtonRegistration }
  >();
  let cancelled = false;

  // The registry is fixed for the life of a registration, so it is read once per
  // session: an agent directory of N agents must not issue N identical RPCs.
  let actionsPromise: Promise<readonly ActionSummary[]> | null = null;
  function loadActionsOnce(): Promise<readonly ActionSummary[]> {
    actionsPromise ??= dependencies.listActions().catch((error: unknown) => {
      // Do not cache a failure: the next agent may still register.
      actionsPromise = null;
      throw error;
    });
    return actionsPromise;
  }

  function remove(agentId: string): void {
    const entry = entries.get(agentId);
    if (!entry) return;
    entry.registration.remove();
    entries.delete(agentId);
  }

  async function upsert(agent: AgentPillAgent): Promise<void> {
    if (cancelled) return;
    const existing = entries.get(agent.agentId);
    if (existing) {
      if (existing.workspaceId === agent.workspaceId) return;
      remove(agent.agentId);
    }

    // Fail closed on a settings or registry read failure: no pill is registered
    // rather than a pill whose enabled set is unknown.
    let actions: readonly ActionSummary[];
    try {
      actions = await loadActionsOnce();
    } catch (error) {
      console.error("[prompt-kit] failed to list actions", error);
      return;
    }
    if (cancelled || entries.has(agent.agentId)) return;
    const settings = await dependencies.readSettings();
    if (settings.status !== "ready") {
      console.error("[prompt-kit] settings unavailable; no pill registered", settings.error);
      return;
    }
    if (cancelled || entries.has(agent.agentId)) return;

    const enabled = enabledActions(actions, settings.values);
    if (enabled.length === 0) return;

    const isActive = () =>
      entries.get(agent.agentId)?.workspaceId === agent.workspaceId;
    const registration = client.addComposerPill({
      id: PILL_ID,
      workspaceId: agent.workspaceId,
      agentId: agent.agentId,
      button: pillButton(enabled, createRunner(agent, isActive)),
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
    void upsert({ workspaceId: agent.workspaceId, agentId: agent.id });
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
    cancelled = true;
    unsubscribe();
    for (const agentId of [...entries.keys()]) remove(agentId);
  };
}
