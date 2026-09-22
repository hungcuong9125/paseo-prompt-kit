import type { ComposerAdapter } from "./adapter.js";
import { describeComposerTopology, inspectComposers, locateComposerField, setNativeValue } from "./dom.js";
import { startRewriteEffect } from "./effect.js";

export { COMPOSER_INPUT_SELECTOR, COMPOSER_ROOT_SELECTOR, isElementVisible } from "./dom.js";

/**
 * The rewrite path needs a stable identity for "the Composer the user pressed the
 * pill in", not merely "some Composer that is currently visible". When more than
 * one Composer is genuinely visible (a split pane), the adapter must refuse: the
 * plugin has no relation from a pill to its own agent's pane. Binding the pill to
 * its pane is the `composer-resolver` work unit of CORE v0.2.0.
 */
function locateField(): HTMLTextAreaElement | null {
  return locateComposerField();
}

export function createWebComposerAdapter(): ComposerAdapter {
  return {
    isSupported(): boolean {
      return typeof document !== "undefined";
    },
    readText(): string | null {
      if (typeof document === "undefined") return null;
      return locateField()?.value ?? null;
    },
    replaceText(next: string): boolean {
      if (typeof document === "undefined") return false;
      const field = locateField();
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
    focus(): void {
      if (typeof document === "undefined") return;
      locateField()?.focus();
    },
    beginRewriteEffect(): () => void {
      if (typeof document === "undefined") return () => {};
      const field = locateField();
      return field ? startRewriteEffect(field) : () => {};
    },
    describeFailure(): string {
      if (typeof document === "undefined") {
        return "PromptKit can rewrite only on Desktop and Web: the mobile app gives plugins no access to the Composer text.";
      }
      return describeComposerTopology(inspectComposers());
    },
  };
}
