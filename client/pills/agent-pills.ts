import type { ComponentType } from "react";
import type {
  PluginButton,
  PluginButtonContentProps,
  PluginButtonMenuEntry,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import type { ActionPack } from "../../shared/action-registry/schema.js";
import type { ActionSummary } from "../../shared/rpc.js";
import { enabledActions } from "../actions/enabled.js";
import { PLUGIN_ICON } from "../icon.js";
import type { SettingsRead } from "../settings/read-settings.js";
import { reachesPill, type RewriteStatus, type RewriteStatusBus } from "./rewrite-status.js";

export interface AgentPillAgent {
  workspaceId: string;
  agentId: string;
}

export type AgentPillRunner = (actionId: string) => Promise<void>;

export interface AgentPillDependencies {
  /** Loaded actions for these custom packs, from `prompt-kit.actions.list`. */
  listActions: (customActions: readonly ActionPack[]) => Promise<readonly ActionSummary[]>;
  readSettings: () => Promise<SettingsRead>;
  /** When set, the pill opens this popover (host renders it as a bottom sheet on mobile). */
  popover?: ComponentType<PluginButtonContentProps>;
  /** Fires after this client saves the settings, so every pill re-reads its enabled set. */
  onSettingsSaved: (listener: () => void) => () => void;
  statuses: RewriteStatusBus;
}

const PILL_ID = "prompt-kit";
const REWRITTEN_MS = 2000;

/** The label that shows a rewrite's progress on the pill; `pill-tint` colors it by label. */
export function pillPresentation(status: RewriteStatus): Pick<PluginButton, "label"> {
  if (status === "rewriting") return { label: "Rewriting..." };
  if (status === "rewritten") return { label: "Rewritten" };
  return { label: "PromptKit" };
}

/** Pill for the enabled set `E`: one action → button, several → menu, popover → sheet. */
export function pillButton(
  enabled: readonly ActionSummary[],
  run: AgentPillRunner,
  popover?: ComponentType<PluginButtonContentProps>,
  status: RewriteStatus = "idle",
): PluginButton {
  const first = enabled[0]!;
  const base = { title: "PromptKit", icon: PLUGIN_ICON, ...pillPresentation(status) };

  if (popover !== undefined) {
    return { ...base, behavior: { kind: "popover", Content: popover } };
  }

  if (enabled.length === 1) {
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
 * or archive drops it, and cleanup drops every registration. A settings save
 * re-reads `E` and updates, adds or drops each pill to match.
 */
export function registerAgentPills(
  client: PluginClientContext,
  createRunner: (agent: AgentPillAgent, isActive: () => boolean) => AgentPillRunner,
  dependencies: AgentPillDependencies,
): () => void {
  const entries = new Map<
    string,
    {
      workspaceId: string;
      registration: PluginButtonRegistration;
      run: AgentPillRunner;
      status: RewriteStatus;
      reset: ReturnType<typeof setTimeout> | null;
    }
  >();
  /** Every live agent, with or without a pill, so a save can add a pill that was missing. */
  const live = new Map<string, AgentPillAgent>();
  let cancelled = false;

  // The registry depends only on the custom packs, so it is read once per set of
  // them: an agent directory of N agents must not issue N identical RPCs.
  let cached: { key: string; promise: Promise<readonly ActionSummary[]> } | null = null;
  function loadActions(customActions: readonly ActionPack[]): Promise<readonly ActionSummary[]> {
    const key = JSON.stringify(customActions);
    if (cached?.key !== key) {
      const promise = dependencies.listActions(customActions).catch((error: unknown) => {
        // Do not cache a failure: the next agent may still register.
        if (cached?.promise === promise) cached = null;
        throw error;
      });
      cached = { key, promise };
    }
    return cached.promise;
  }

  function remove(agentId: string): void {
    const entry = entries.get(agentId);
    if (!entry) return;
    if (entry.reset !== null) clearTimeout(entry.reset);
    entry.registration.remove();
    entries.delete(agentId);
  }

  /**
   * The enabled set from the current settings, or null when it cannot be known.
   * Fail closed: a settings or registry read failure registers no pill rather
   * than a pill whose enabled set is unknown.
   */
  async function readEnabled(): Promise<readonly ActionSummary[] | null> {
    const settings = await dependencies.readSettings();
    if (settings.status !== "ready") {
      console.error("[prompt-kit] settings unavailable; no pill registered", settings.error);
      return null;
    }
    try {
      const actions = await loadActions(settings.values.customActions);
      return enabledActions(actions, settings.values);
    } catch (error) {
      console.error("[prompt-kit] failed to list actions", error);
      return null;
    }
  }

  async function upsert(agent: AgentPillAgent): Promise<void> {
    if (cancelled) return;
    const existing = entries.get(agent.agentId);
    if (existing) {
      if (existing.workspaceId === agent.workspaceId) return;
      remove(agent.agentId);
    }

    const enabled = await readEnabled();
    if (cancelled || entries.has(agent.agentId) || enabled === null || enabled.length === 0) return;

    const isActive = () =>
      entries.get(agent.agentId)?.workspaceId === agent.workspaceId;
    const run = createRunner(agent, isActive);
    const registration = client.addComposerPill({
      id: PILL_ID,
      workspaceId: agent.workspaceId,
      agentId: agent.agentId,
      button: pillButton(enabled, run, dependencies.popover),
    });
    entries.set(agent.agentId, { workspaceId: agent.workspaceId, registration, run, status: "idle", reset: null });
  }

  /** After a save: each live agent's pill follows the new `E` — updated, added, or dropped. */
  async function refresh(): Promise<void> {
    const enabled = await readEnabled();
    if (cancelled || enabled === null) return;
    for (const agent of live.values()) {
      const entry = entries.get(agent.agentId);
      if (enabled.length === 0) remove(agent.agentId);
      else if (entry) entry.registration.update(pillButton(enabled, entry.run, dependencies.popover, entry.status));
      else void upsert(agent);
    }
  }

  /** "Rewritten" holds for REWRITTEN_MS, then the pill returns to idle. */
  function show(agentId: string, status: RewriteStatus): void {
    const entry = entries.get(agentId);
    if (!entry) return;
    if (entry.reset !== null) clearTimeout(entry.reset);
    entry.reset = status === "rewritten" ? setTimeout(() => show(agentId, "idle"), REWRITTEN_MS) : null;
    entry.status = status;
    entry.registration.update(pillPresentation(status));
  }

  function accept(agent: {
    id: string;
    workspaceId?: string | undefined;
    archivedAt?: string | null | undefined;
  }): void {
    if (agent.archivedAt || !agent.workspaceId) {
      live.delete(agent.id);
      remove(agent.id);
      return;
    }
    const entry = { workspaceId: agent.workspaceId, agentId: agent.id };
    live.set(agent.id, entry);
    void upsert(entry);
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "upsert") {
      accept(update.agent);
    } else {
      live.delete(update.agentId);
      remove(update.agentId);
    }
  });
  const stopFollowingSaves = dependencies.onSettingsSaved(() => void refresh());
  const stopFollowingStatus = dependencies.statuses.subscribe((target, status) => {
    for (const [agentId, entry] of entries) {
      if (reachesPill(target, { workspaceId: entry.workspaceId, agentId })) show(agentId, status);
    }
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
    stopFollowingSaves();
    stopFollowingStatus();
    for (const agentId of [...entries.keys()]) remove(agentId);
  };
}
