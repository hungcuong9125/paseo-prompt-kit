import { loadActionRegistry, type ActionRegistry } from "./loader.js";
import { bundledPacks } from "../packs/index.js";
import type { ActionsListOutput } from "../rpc.js";
import { actionPackSchema, actionOverridesSchema, type ActionOverrides, type ActionPack } from "./schema.js";

/**
 * Overrides configure a bundled identity; they never introduce another pack.
 * Custom id collisions still reject both owners. Invalid overrides cannot run defaults.
 */
export function actionRegistry(customPacks: readonly unknown[] = [], overrides: ActionOverrides = {}): ActionRegistry {
  const checked = actionOverridesSchema.parse(overrides);
  const known = new Set(loadActionRegistry(bundledPacks).actions.map((pack) => pack.id));
  for (const id of Object.keys(checked)) {
    if (!known.has(id)) throw new Error(`No bundled action owns override "${id}".`);
  }
  return loadActionRegistry([...bundledPacks.map((entry) => {
    const pack = actionPackSchema.safeParse(entry);
    return pack.success ? { ...pack.data, ...checked[pack.data.id] } : entry;
  }), ...customPacks]);
}

export function listActions(customPacks: readonly unknown[] = [], overrides: ActionOverrides = {}): ActionRegistry["actions"] {
  return actionRegistry(customPacks, overrides).actions;
}

export function listRejectedPacks(customPacks: readonly unknown[] = []): ActionRegistry["rejected"] {
  return actionRegistry(customPacks).rejected;
}

/** The `prompt-kit.actions.list` answer: summaries marked bundled or custom, plus refusals. */
export function summarizeActions(customPacks: readonly ActionPack[], overrides: ActionOverrides = {}): ActionsListOutput {
  const registry = actionRegistry(customPacks, overrides);
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
      system: action.systemPrompt,
      task: action.taskInstruction,
      modified: Object.hasOwn(overrides, action.id),
    })),
    rejected: registry.rejected.map((entry) => ({ source: entry.source, reason: entry.reason })),
  };
}

/** Resolves an id to its definition, or null when no loaded pack owns it. */
export function resolveAction(
  actionId: string,
  customPacks: readonly unknown[] = [],
  overrides: ActionOverrides = {},
): ActionRegistry["actions"][number] | null {
  return listActions(customPacks, overrides).find((action) => action.id === actionId) ?? null;
}
