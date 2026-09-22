import { loadActionRegistry, type ActionRegistry } from "./loader.js";
import { bundledPacks } from "../packs/index.js";

/**
 * The one live registry. It is filled at module load from the bundled barrel,
 * so there is no hand-written list of actions anywhere in the plugin.
 */
const registry: ActionRegistry = loadActionRegistry(bundledPacks);

export function listActions(): ActionRegistry["actions"] {
  return registry.actions;
}

export function listRejectedPacks(): ActionRegistry["rejected"] {
  return registry.rejected;
}

/** Resolves an id to its definition, or null when no loaded pack owns it. */
export function resolveAction(actionId: string): ActionRegistry["actions"][number] | null {
  return registry.actions.find((action) => action.id === actionId) ?? null;
}
