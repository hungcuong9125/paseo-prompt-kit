// Paseo has no public plugin API for Composer text, so Desktop/Web attach to the
// DOM. Selectors come from the app source, never from positional structure.
// `[data-testid="message-input-root"]` - packages/app/src/composer/input/input.tsx:1787
// `textarea[data-composer-input]`    - dataSet={COMPOSER_INPUT_DATASET} at input.tsx:670
//                                      from input.tsx:87, and consumed by
//                                      packages/app/src/styles/install-web-scrollbar-styles.web.ts:22
export const COMPOSER_ROOT_SELECTOR = '[data-testid="message-input-root"]';
export const COMPOSER_INPUT_SELECTOR = "textarea[data-composer-input]";

/**
 * An inactive pane stays mounted inside `RetainedPanel` and is hidden at an
 * **ancestor** with `display: none`
 * (packages/app/src/components/retained-panel.tsx:66-67). That removes the whole
 * subtree from rendering, but the descendant's own computed `display` is still
 * `flex`, so reading the element alone reports every retained Composer as
 * visible. `display` is not inherited, so the ancestor chain must be walked.
 *
 * `visibility` is checked along the same chain: the host hides retained panes
 * with `display`, and a stricter walk can only refuse more, never rewrite a
 * Composer it cannot prove the user sees.
 */
export function isElementVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return true;
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.display === "none") return false;
    if (style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  return true;
}

/**
 * Resolves the one Composer the user can see. Exactly one visible root carrying
 * exactly one visible field must be provable; any other topology returns null so
 * the caller refuses instead of rewriting a Composer it cannot identify.
 */
export function locateComposerField(root: ParentNode = document): HTMLTextAreaElement | null {
  const roots = Array.from(root.querySelectorAll(COMPOSER_ROOT_SELECTOR)).filter(isElementVisible);
  if (roots.length !== 1) return null;
  const onlyRoot = roots[0];
  if (!onlyRoot) return null;
  const fields = Array.from(
    onlyRoot.querySelectorAll<HTMLTextAreaElement>(COMPOSER_INPUT_SELECTOR),
  ).filter(isElementVisible);
  if (fields.length !== 1) return null;
  return fields[0] ?? null;
}

/**
 * React tracks the value it last saw, so a plain assignment is invisible to
 * `onChange`. The native setter updates the DOM without tripping React's own
 * value tracking, and the bubbling `input` event is what React listens to.
 */
export function setNativeValue(field: HTMLTextAreaElement, value: string): void {
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
