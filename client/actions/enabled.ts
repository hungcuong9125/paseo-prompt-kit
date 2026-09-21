import type { ActionSummary } from "../../shared/rpc.js";
import type { PromptKitSettings } from "../../shared/settings.js";

/**
 * The locked UX: `E` is the set of loaded actions the user has enabled.
 *
 * `|E| == 1` shows a direct action button, `|E| >= 2` shows a menu, and
 * `|E| == 0` shows nothing at all. Ordering follows the registry so the pill
 * does not depend on settings-object key order.
 */
export function enabledActions(
  actions: readonly ActionSummary[],
  settings: PromptKitSettings,
): readonly ActionSummary[] {
  return actions.filter((action) => settings.actionEnabled[action.id] ?? action.enabledByDefault);
}
