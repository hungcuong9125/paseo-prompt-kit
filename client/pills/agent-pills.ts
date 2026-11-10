import type { ComponentType } from "react";
import type {
  PluginButton,
  PluginButtonContentProps,
  PluginButtonMenuEntry,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import type { ActionPack, ActionOverrides } from "../../shared/action-registry/schema.js";
import type { ActionSummary } from "../../shared/rpc.js";
import { enabledActions } from "../actions/enabled.js";
import { PLUGIN_ICON } from "../icon.js";
import { readLastRewrite } from "../rewrite-records.js";
import { RewriteBusyError } from "./rewrite-runner.js";
import type { SettingsRead } from "../settings/read-settings.js";
import { tNow } from "../i18n/core.js";
import { reachesPill, type RewriteStatus, type RewriteStatusBus } from "./rewrite-status.js";

export interface AgentPillAgent {
  workspaceId: string;
  agentId: string;
}

export interface AgentPillRunner {
  run(actionId: string): Promise<void>;
  /** Swaps the Composer between the last rewrite and its original; absent
   *  where the underlying runner cannot reach a Composer. */
  swapOriginal?(): void;
}

export interface AgentPillDependencies {
  /** Loaded actions for these custom packs, from `prompt-kit.actions.list`. */
  listActions: (customActions: readonly ActionPack[], actionOverrides?: ActionOverrides) => Promise<readonly ActionSummary[]>;
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
  if (status === "failed") return { label: "Rewrite failed" };
  return { label: "PromptKit" };
}

/**
 * Pill for the enabled set `E`: one action → button, several → menu, popover →
 * sheet. `swap` (present once a rewrite has been recorded for the agent) turns
 * a single-action button into a menu and appends a "swap rewrite/original"
 * item to a menu: the pill is the desktop's surface for reviewing the original.
 */
export function pillButton(
  enabled: readonly ActionSummary[],
  run: AgentPillRunner,
  popover?: ComponentType<PluginButtonContentProps>,
  status: RewriteStatus = "idle",
  swap?: () => void,
): PluginButton {
  const first = enabled[0]!;
  const base = { title: "PromptKit", icon: PLUGIN_ICON, ...pillPresentation(status) };

  if (popover !== undefined) {
    return { ...base, behavior: { kind: "popover", Content: popover } };
  }

  const swapItem: PluginButtonMenuEntry | null = swap
    ? {
        kind: "item",
        id: "prompt-kit-swap",
        title: tNow("pill.swapVersions"),
        icon: "ArrowLeftRight",
        behavior: { kind: "action", onPress: () => swap() },
      }
    : null;

  if (enabled.length === 1 && swapItem === null) {
    return {
      ...base,
      title: first.title,
      behavior: { kind: "action", onPress: () => run.run(first.id) },
    };
  }

  const items: PluginButtonMenuEntry[] = enabled.map((action) => ({
    kind: "item",
    id: action.id,
    title: action.title,
    icon: action.icon,
    behavior: { kind: "action", onPress: () => run.run(action.id) },
  }));
  if (swapItem !== null) {
    items.push({ kind: "separator", id: "prompt-kit-swap-separator" });
    items.push(swapItem);
  }
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
      runner: AgentPillRunner;
      enabled: readonly ActionSummary[];
      status: RewriteStatus;
      reset: ReturnType<typeof setTimeout> | undefined;
    }
  >();
  /** Every live agent, with or without a pill, so a save can add a pill that was missing. */
  const live = new Map<string, AgentPillAgent>();
  let cancelled = false;
  let refreshGeneration = 0;
  const updated = new Set<string>();

  // The registry depends only on the custom packs, so it is read once per set of
  // them: an agent directory of N agents must not issue N identical RPCs.
  let cached: { key: string; promise: Promise<readonly ActionSummary[]> } | null = null;
  function loadActions(customActions: readonly ActionPack[], overrides: ActionOverrides): Promise<readonly ActionSummary[]> {
    const key = JSON.stringify([customActions, overrides]);
    if (cached?.key !== key) {
      const promise = dependencies.listActions(customActions, overrides).catch((error: unknown) => {
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
      const actions = await loadActions(settings.values.customActions, settings.values.actionOverrides);
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

    const generation = refreshGeneration;
    const enabled = await readEnabled();
    if (generation !== refreshGeneration) { if (!cancelled && live.get(agent.agentId) === agent) void upsert(agent); return; }
    if (cancelled || live.get(agent.agentId) !== agent || entries.has(agent.agentId) || enabled === null || enabled.length === 0) return;

    const isActive = () =>
      live.get(agent.agentId) === agent && entries.get(agent.agentId)?.workspaceId === agent.workspaceId;
    const rawRunner = createRunner(agent, isActive);
    // The host owns menu/button invocations and may ignore the returned
    // promise, and a desktop pill has no toast — so the failure is surfaced
    // here: log it and hold a "Rewrite failed" label on the pill. The stored
    // runner never rejects, so no invocation site can leak an unhandled
    // rejection.
    const runner: AgentPillRunner = {
      run: (actionId) =>
        rawRunner.run(actionId).catch((error: unknown) => {
          // Re-entry is flow control, not a failure: the running rewrite still
          // owns the pill, so the state stays exactly as it is.
          if (error instanceof RewriteBusyError) return;
          // The host owns menu/button invocations and may ignore the returned
          // promise, and a desktop pill has no toast — so the failure is
          // surfaced here: log it and hold a "Rewrite failed" label on the
          // pill. The stored runner never rejects, so no invocation site can
          // leak an unhandled rejection.
          console.error("[prompt-kit] rewrite failed", error);
          show(agent.agentId, "failed");
        }),
      swapOriginal: () => rawRunner.swapOriginal?.(),
    };
    // A record can already exist when this pill registers (a sheet rewrite
    // ran before the pill came up) — the menu then starts with the swap item.
    const swap = readLastRewrite(agent.agentId) === undefined ? undefined : () => runner.swapOriginal?.();
    const registration = client.addComposerPill({
      id: PILL_ID,
      workspaceId: agent.workspaceId,
      agentId: agent.agentId,
      button: pillButton(enabled, runner, dependencies.popover, undefined, swap),
    });
    entries.set(agent.agentId, { workspaceId: agent.workspaceId, registration, runner, enabled, status: "idle", reset: undefined });
  }

  /** After a save: each live agent's pill follows the new `E` — updated, added, or dropped. */
  async function refresh(): Promise<void> {
    const generation = ++refreshGeneration;
    const enabled = await readEnabled();
    if (cancelled || generation !== refreshGeneration) return;
    if (enabled === null) {
      for (const id of entries.keys()) remove(id);
      return;
    }
    for (const agent of live.values()) {
      const entry = entries.get(agent.agentId);
      if (enabled.length === 0) remove(agent.agentId);
      else if (entry) {
        // Popover pills must never be updated: the Android host rebuilds the
        // popover from the descriptor and dismisses a sheet that is open on
        // it (see `show`). The 15 s poll lands here too, so the guard is not
        // optional; on popover the descriptor is enabled-independent anyway.
        if (dependencies.popover === undefined)
          entry.registration.update(pillButton(enabled, entry.runner, undefined, entry.status, swapFor(agent.agentId)));
      }
      else void upsert(agent);
    }
  }

  /** The desktop swap callback for an agent when a rewrite is recorded — the
   *  pill menu is the desktop's surface for reviewing the original. */
  function swapFor(agentId: string): (() => void) | undefined {
    if (readLastRewrite(agentId) === undefined) return undefined;
    const entry = entries.get(agentId);
    if (!entry) return undefined;
    return () => entry.runner.swapOriginal?.();
  }

  /** "Rewritten" holds for REWRITTEN_MS, then the pill returns to idle. */
  function show(agentId: string, status: RewriteStatus): void {
    const entry = entries.get(agentId);
    if (!entry) return;
    clearTimeout(entry.reset);
    entry.reset =
      status === "rewritten" || status === "failed"
        ? setTimeout(() => show(agentId, "idle"), REWRITTEN_MS)
        : undefined;
    entry.status = status;
    // On mobile the pill is a popover, and updating the button dismisses the
    // open sheet mid-rewrite (the host rebuilds the popover from the new
    // descriptor). The sheet shows its own progress, so the label update is
    // desktop-only.
    if (dependencies.popover !== undefined) return;
    // Desktop rebuilds the whole button, not just the label: a first recorded
    // rewrite must upgrade the pill to a menu that carries the swap entry.
    entry.registration.update(pillButton(entry.enabled, entry.runner, undefined, status, swapFor(agentId)));
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
    const current = live.get(agent.id);
    const entry = current?.workspaceId === agent.workspaceId ? current : { workspaceId: agent.workspaceId, agentId: agent.id };
    live.set(agent.id, entry);
    void upsert(entry);
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    updated.add(update.kind === "upsert" ? update.agent.id : update.agentId);
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
      for (const entry of result.entries) if (!updated.has(entry.agent.id)) accept(entry.agent);
    })
    .catch((error: unknown) => {
      console.error("[prompt-kit] failed to list agents", error);
    });

  const poll = setInterval(() => void refresh(), 15_000);
  return () => {
    clearInterval(poll);
    cancelled = true;
    unsubscribe();
    stopFollowingSaves();
    stopFollowingStatus();
    for (const agentId of [...entries.keys()]) remove(agentId);
  };
}
