import { actionPackSchema, type ActionPack } from "../../shared/action-registry/schema.js";
import type { ActionSummary } from "../../shared/rpc.js";
import type { PromptKitSettings } from "../../shared/settings.js";
import { MAX_ENABLED_ACTIONS, enabledActions } from "../actions/enabled.js";

export type ParsedAction = { ok: true; pack: ActionPack } | { ok: false; error: string };

/** JSON as the editor shows it. */
export function formatPack(pack: ActionPack): string {
  return JSON.stringify(pack, null, 2);
}

/** `base`, or `base-2`, `base-3`… so a sample never collides with a loaded action. */
export function freeActionId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Editor text → a pack that can be stored, or the reason it cannot. `takenIds`
 * holds every loaded action id except the one being edited.
 */
export function parseCustomAction(text: string, takenIds: ReadonlySet<string>): ParsedAction {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const parsed = actionPackSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    return { ok: false, error: `${path === "" ? "The pack" : `"${path}"`}: ${issue?.message ?? "invalid"}` };
  }
  if (takenIds.has(parsed.data.id)) {
    return { ok: false, error: `Another action already uses the id "${parsed.data.id}".` };
  }
  return { ok: true, pack: parsed.data };
}

/**
 * The settings change that stores `pack` in place of `replacingId` (null adds it).
 * A renamed action keeps its switch; a new one starts off when the enabled set is full.
 */
export function storeCustomAction(
  current: PromptKitSettings,
  actions: readonly ActionSummary[],
  pack: ActionPack,
  replacingId: string | null,
): Partial<PromptKitSettings> {
  const customActions =
    replacingId === null
      ? [...current.customActions, pack]
      : current.customActions.map((existing) => (existing.id === replacingId ? pack : existing));

  const actionEnabled = { ...current.actionEnabled };
  if (replacingId !== null && replacingId !== pack.id && replacingId in actionEnabled) {
    actionEnabled[pack.id] = actionEnabled[replacingId]!;
    delete actionEnabled[replacingId];
  }
  if (replacingId === null) {
    const full = enabledActions(actions, current).length >= MAX_ENABLED_ACTIONS;
    if (full && pack.enabledByDefault) actionEnabled[pack.id] = false;
  }
  return { customActions, actionEnabled };
}

/** The settings change that deletes a custom action and its switch. */
export function removeCustomAction(current: PromptKitSettings, id: string): Partial<PromptKitSettings> {
  const { [id]: _removed, ...actionEnabled } = current.actionEnabled;
  return {
    customActions: current.customActions.filter((pack) => pack.id !== id),
    actionEnabled,
  };
}
