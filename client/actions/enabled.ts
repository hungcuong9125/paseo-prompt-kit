import type { ActionSummary } from "../../shared/rpc.js";
import type { PromptKitSettings } from "../../shared/settings.js";

/** The most actions the pill menu and the mobile sheet show at once. */
export const MAX_ENABLED_ACTIONS = 6;

/**
 * The locked UX: `E` is the set of loaded actions the user has enabled.
 *
 * A single enabled action is a direct action button, two or more are a menu, and
 * none hides the pill. Ordering follows the registry so the pill does not depend
 * on settings-object key order.
 */
export function enabledActions(
  actions: readonly ActionSummary[],
  settings: PromptKitSettings,
): readonly ActionSummary[] {
  return actions.filter((action) => settings.actionEnabled[action.id] ?? action.enabledByDefault);
}

/** Why the enabled set cannot be saved, or null. */
export function describeEnabledLimit(
  actions: readonly ActionSummary[],
  settings: PromptKitSettings,
): string | null {
  const count = enabledActions(actions, settings).length;
  return count > MAX_ENABLED_ACTIONS
    ? `${count} actions are enabled; turn some off to keep at most ${MAX_ENABLED_ACTIONS}.`
    : null;
}
