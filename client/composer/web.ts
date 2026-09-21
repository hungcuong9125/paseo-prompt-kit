import type { ComposerAdapter } from "./adapter.js";

// Paseo has no public plugin API for Composer text, so Desktop/Web attach to the
// DOM. Selectors come from the app source, never from positional structure.
// `[data-testid="message-input-root"]` - packages/app/src/composer/input/input.tsx:1787
// `textarea[data-composer-input]`    - dataSet={COMPOSER_INPUT_DATASET} at input.tsx:670
//                                      from input.tsx:87, and consumed by
//                                      packages/app/src/styles/install-web-scrollbar-styles.web.ts:22
export const COMPOSER_ROOT_SELECTOR = '[data-testid="message-input-root"]';
export const COMPOSER_INPUT_SELECTOR = "textarea[data-composer-input]";

/**
 * A hidden Composer (inactive tab, unmounted pane) must not be rewritten.
 * Returns null unless exactly one Composer root is present and visible.
 */
function locateField(root: ParentNode = document): HTMLTextAreaElement | null {
  const roots = Array.from(root.querySelectorAll(COMPOSER_ROOT_SELECTOR)).filter(isVisible);
  if (roots.length !== 1) return null;
  const fields = Array.from(
    roots[0]!.querySelectorAll<HTMLTextAreaElement>(COMPOSER_INPUT_SELECTOR),
  ).filter(isVisible);
  if (fields.length !== 1) return null;
  return fields[0]!;
}

function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return true;
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * React tracks the value it last saw, so a plain assignment is invisible to
 * `onChange`. The native setter updates the DOM without tripping React's own
 * value tracking, and the bubbling `input` event is what React listens to.
 */
function setNativeValue(field: HTMLTextAreaElement, value: string): void {
  let prototype: object | null = Object.getPrototypeOf(field) as object | null;
  while (prototype) {
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) {
      setter.call(field, value);
      return;
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  field.value = value;
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
  };
}
