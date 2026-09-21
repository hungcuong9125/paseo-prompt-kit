import type { ActionSummary } from "../../shared/rpc.js";
import type { PromptKitSettings } from "../../shared/settings.js";

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
