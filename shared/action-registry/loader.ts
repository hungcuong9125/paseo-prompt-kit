import { actionPackSchema, toActionDefinition, type ActionDefinition } from "./schema.js";

export interface RejectedPack {
  /** The pack's own id when readable, else its position in the barrel. */
  readonly source: string;
  readonly reason: string;
}

export interface ActionRegistry {
  readonly actions: readonly ActionDefinition[];
  readonly rejected: readonly RejectedPack[];
}

function describeEntry(entry: unknown, index: number): string {
  if (entry !== null && typeof entry === "object" && "id" in entry) {
    const id = (entry as { id?: unknown }).id;
    if (typeof id === "string" && id !== "") return id;
  }
  return `#${index}`;
}

/**
 * Loads the static pack barrel. Fail fast and fail closed: a pack that does not
 * match the schema, or whose id collides with another, is rejected on its own —
 * the rest of the registry still loads, and nothing falls back to a default
 * action. A colliding id rejects **both** packs, because silently preferring one
 * would make which action runs depend on barrel order.
 */
export function loadActionRegistry(packs: readonly unknown[]): ActionRegistry {
  const parsed: { source: string; definition: ActionDefinition }[] = [];
  const rejected: RejectedPack[] = [];

  for (const [index, entry] of packs.entries()) {
    const source = describeEntry(entry, index);
    const result = actionPackSchema.safeParse(entry);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join(".") ?? "";
      rejected.push({
        source,
        reason: `invalid pack: ${path === "" ? "schema" : path} ${issue?.message ?? ""}`.trim(),
      });
      continue;
    }
    parsed.push({ source, definition: toActionDefinition(result.data) });
  }

  const counts = new Map<string, number>();
  for (const { definition } of parsed) {
    counts.set(definition.id, (counts.get(definition.id) ?? 0) + 1);
  }

  const actions: ActionDefinition[] = [];
  for (const { source, definition } of parsed) {
    if ((counts.get(definition.id) ?? 0) > 1) {
      rejected.push({ source, reason: `duplicate action id: ${definition.id}` });
      continue;
    }
    actions.push(definition);
  }

  return { actions, rejected };
}
