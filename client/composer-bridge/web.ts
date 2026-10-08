import type { ComposerAdapter } from "./adapter.js";
import { COMPOSER_INPUT_SELECTOR, describeComposerTopology, inspectComposers, isElementVisible, locateComposerField, setNativeValue } from "./dom.js";
import { startRewriteEffect } from "./effect.js";

export { COMPOSER_INPUT_SELECTOR, COMPOSER_ROOT_SELECTOR, isElementVisible } from "./dom.js";

export interface ComposerIdentity { agentId: string | null; workspaceId: string }
interface Fiber { return: Fiber | null; memoizedProps: Record<string, unknown> | null; alternate?: Fiber | null }
const busyFields = new WeakSet<HTMLTextAreaElement>();

/** The host carries both ids on the Composer owner. Missing or conflicting evidence refuses a write. */
function identityOf(field: HTMLTextAreaElement): ComposerIdentity | null {
  const key = Object.keys(field).find((name) => name.startsWith("__reactFiber$"));
  if (!key) return null;
  const fiber = (field as unknown as Record<string, Fiber>)[key];
  for (let node = fiber; node; node = node.return ?? undefined) {
    const props = node.memoizedProps;
    if (props && Object.hasOwn(props, "agentId") && typeof props.workspaceId === "string") {
      const agentId = props.agentId;
      if (agentId !== null && typeof agentId !== "string") return null;
      const alternate = node.alternate?.memoizedProps;
      if (alternate && (alternate.agentId !== agentId || alternate.workspaceId !== props.workspaceId)) return null;
      return { agentId, workspaceId: props.workspaceId };
    }
  }
  return null;
}

export function createWebComposerAdapter(target?: ComposerIdentity): ComposerAdapter {
  let bound: HTMLTextAreaElement | null = null;
  let identity: ComposerIdentity | null = null;
  const matches = (field: HTMLTextAreaElement, expected: ComposerIdentity) => {
    const actual = identityOf(field);
    return actual !== null && actual.agentId === expected.agentId && actual.workspaceId === expected.workspaceId;
  };
  const locate = (): HTMLTextAreaElement | null => {
    if (typeof document === "undefined") return null;
    if (bound) return isElementVisible(bound) && (!identity || matches(bound, identity)) ? bound : null;
    if (!target) return locateComposerField();
    const fields = Array.from(document.querySelectorAll<HTMLTextAreaElement>(COMPOSER_INPUT_SELECTOR))
      .filter((field) => {
        const actual = identityOf(field);
        return isElementVisible(field) && actual !== null && actual.workspaceId === target.workspaceId && (target.agentId === null || actual.agentId === target.agentId);
      });
    return fields.length === 1 ? fields[0]! : null;
  };
  return {
    isSupported: () => typeof document !== "undefined",
    readText: () => locate()?.value ?? null,
    replaceText(next) {
      const field = locate();
      if (!field) return false;
      const original = field.value;
      setNativeValue(field, next);
      field.setSelectionRange(next.length, next.length);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      if (field.value !== next) {
        setNativeValue(field, original);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        return false;
      }
      return true;
    },
    focus: () => locate()?.focus(),
    beginRewriteEffect() {
      const field = locate();
      if (!field) throw new Error("PromptKit could not bind this Composer to its workspace and agent.");
      if (busyFields.has(field)) throw new Error("PromptKit is already rewriting this prompt.");
      busyFields.add(field);
      bound = field;
      identity = identityOf(field);
      const stop = startRewriteEffect(field);
      return () => { stop(); busyFields.delete(field); bound = null; identity = null; };
    },
    describeFailure() {
      if (typeof document === "undefined") return "Use the PromptKit sheet on mobile.";
      const topology = inspectComposers();
      if (topology.visibleFields > 0 && target) return "PromptKit could not identify this agent's Composer. No text was changed.";
      return describeComposerTopology(topology);
    },
  };
}
