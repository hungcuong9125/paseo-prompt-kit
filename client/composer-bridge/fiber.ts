/**
 * The host's `MessageInputRef`: its `replaceText` also updates the Composer's
 * own state (live-text presence, draft), which the inner text field's handle
 * does not. `getInputSnapshot` is the marker that tells the two apart.
 */
export interface ComposerTextHandle {
  getText(): string;
  replaceText(text: string): void;
  focus(): void;
  getInputSnapshot(): unknown;
}

interface FiberLike {
  return: FiberLike | null;
  child: FiberLike | null;
  sibling: FiberLike | null;
  memoizedProps: Record<string, unknown> | null;
  ref?: unknown;
}

const MAX_VISITED = 50_000;

/** Fabric public instances carry their fiber; anything else yields null. */
export function fiberOf(instance: unknown): FiberLike | null {
  if (instance === null || typeof instance !== "object") return null;
  const fiber = (instance as { __internalInstanceHandle?: unknown }).__internalInstanceHandle;
  return fiber !== null && typeof fiber === "object" && "return" in fiber ? (fiber as FiberLike) : null;
}

function isMessageInputHandle(current: unknown): current is ComposerTextHandle {
  if (current === null || typeof current !== "object") return false;
  const handle = current as Partial<ComposerTextHandle>;
  return (
    typeof handle.getText === "function" &&
    typeof handle.replaceText === "function" &&
    typeof handle.focus === "function" &&
    typeof handle.getInputSnapshot === "function"
  );
}

function handleOf(fiber: FiberLike): ComposerTextHandle | null {
  for (const ref of [fiber.ref, fiber.memoizedProps?.ref]) {
    const current = (ref as { current?: unknown } | null | undefined)?.current;
    if (isMessageInputHandle(current)) return current;
  }
  return null;
}

function belongsToAgent(fiber: FiberLike, agentId: string): boolean {
  for (let node: FiberLike | null = fiber; node !== null; node = node.return) {
    if (node.memoizedProps?.agentId === agentId) return true;
  }
  return false;
}

export type ComposerLookup =
  | { ok: true; handle: ComposerTextHandle }
  | { ok: false; reason: "no_fiber" | "not_found" | "ambiguous" };

/**
 * Finds the Composer of `agentId` from any fiber in the same React tree: up to
 * the root, then down for the element whose ref is a `MessageInputRef`, under
 * an ancestor whose props name the agent.
 */
export function findComposerHandle(start: FiberLike | null, agentId: string): ComposerLookup {
  if (start === null) return { ok: false, reason: "no_fiber" };
  let root: FiberLike = start;
  while (root.return !== null) root = root.return;

  const handles: ComposerTextHandle[] = [];
  const stack: FiberLike[] = [root];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_VISITED) {
    const fiber = stack.pop()!;
    visited += 1;
    const handle = handleOf(fiber);
    if (handle !== null && !handles.includes(handle) && belongsToAgent(fiber, agentId)) {
      handles.push(handle);
    }
    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  if (handles.length === 1) return { ok: true, handle: handles[0]! };
  if (handles.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: false, reason: "not_found" };
}

export function describeLookupFailure(reason: Exclude<ComposerLookup, { ok: true }>["reason"]): string {
  switch (reason) {
    case "no_fiber":
      return "PromptKit could not reach the app's component tree on this host.";
    case "not_found":
      return "PromptKit could not find this agent's Composer.";
    case "ambiguous":
      return "PromptKit found more than one Composer for this agent.";
  }
}
