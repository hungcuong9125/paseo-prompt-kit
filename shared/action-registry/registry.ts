import { loadActionRegistry, type ActionRegistry } from "./loader.js";
import { bundledPacks } from "../packs/index.js";
import type { ActionsListOutput } from "../rpc.js";
import type { ActionPack } from "./schema.js";

/**
 * The one registry: bundled packs, then the user's custom packs from settings,
 * through the same loader. A custom pack that reuses a bundled id rejects both,
 * so which action runs never depends on order.
 */
export function actionRegistry(customPacks: readonly unknown[] = []): ActionRegistry {
  return loadActionRegistry([...bundledPacks, ...customPacks]);
}

export function listActions(customPacks: readonly unknown[] = []): ActionRegistry["actions"] {
  return actionRegistry(customPacks).actions;
}

export function listRejectedPacks(customPacks: readonly unknown[] = []): ActionRegistry["rejected"] {
  return actionRegistry(customPacks).rejected;
}

/** The `prompt-kit.actions.list` answer: summaries marked bundled or custom, plus refusals. */
export function summarizeActions(customPacks: readonly ActionPack[]): ActionsListOutput {
  const registry = actionRegistry(customPacks);
  const customIds = new Set(customPacks.map((pack) => pack.id));
  return {
    actions: registry.actions.map((action) => ({
      id: action.id,
      version: action.version,
      enabledByDefault: action.enabledByDefault,
      title: action.title,
      description: action.description,
      icon: action.icon,
      custom: customIds.has(action.id),
    })),
    rejected: registry.rejected.map((entry) => ({ source: entry.source, reason: entry.reason })),
  };
}

/** Resolves an id to its definition, or null when no loaded pack owns it. */
export function resolveAction(
  actionId: string,
  customPacks: readonly unknown[] = [],
): ActionRegistry["actions"][number] | null {
  return listActions(customPacks).find((action) => action.id === actionId) ?? null;
}
