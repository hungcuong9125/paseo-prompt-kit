import { afterEach, describe, expect, it } from "vitest";
import {
  COMPOSER_INPUT_SELECTOR,
  COMPOSER_ROOT_SELECTOR,
  createWebComposerAdapter,
} from "../../client/composer/web.js";

/**
 * The fixture reproduces the real Composer DOM: the root carries
 * `testID="message-input-root"` (packages/app/src/composer/input/input.tsx:1787)
 * and the field is a textarea with `dataSet={COMPOSER_INPUT_DATASET}` rendered as
 * `data-composer-input` (input.tsx:670, input.tsx:87).
 */
function mountComposer(value = "", options: { readonly?: boolean } = {}): HTMLTextAreaElement {
  const root = document.createElement("div");
  root.setAttribute("data-testid", "message-input-root");
  const field = document.createElement("textarea");
  field.setAttribute("data-composer-input", "");
  field.value = value;
  if (options.readonly) field.readOnly = true;
  root.appendChild(field);
  document.body.appendChild(root);
  return field;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("web composer adapter", () => {
  it("cites the selectors it relies on and matches the real DOM shape", () => {
    expect(COMPOSER_ROOT_SELECTOR).toBe('[data-testid="message-input-root"]');
    expect(COMPOSER_INPUT_SELECTOR).toBe("textarea[data-composer-input]");
    mountComposer();
    expect(document.querySelectorAll(COMPOSER_ROOT_SELECTOR)).toHaveLength(1);
    expect(document.querySelectorAll(COMPOSER_INPUT_SELECTOR)).toHaveLength(1);
  });

  it("reads the current text", () => {
    mountComposer("hello world");
    expect(createWebComposerAdapter().readText()).toBe("hello world");
  });

  it("replaces the text through the native setter and a bubbling input event", () => {
    const field = mountComposer("before");
    const seen: string[] = [];
    field.addEventListener("input", () => seen.push(field.value));
    const adapter = createWebComposerAdapter();

    expect(adapter.replaceText("after")).toBe(true);
    expect(field.value).toBe("after");
    expect(seen).toEqual(["after"]);
    expect(field.selectionStart).toBe(5);
    expect(adapter.readText()).toBe("after");
  });

  it("fails closed when no composer is mounted", () => {
    const adapter = createWebComposerAdapter();
    expect(adapter.isSupported()).toBe(true);
    expect(adapter.readText()).toBeNull();
    expect(adapter.replaceText("x")).toBe(false);
  });

  it("fails closed when two composer roots are present", () => {
    mountComposer("first");
    mountComposer("second");
    const adapter = createWebComposerAdapter();
    expect(adapter.readText()).toBeNull();
    expect(adapter.replaceText("x")).toBe(false);
    expect(document.body.textContent).toBe("");
  });

  it("ignores a hidden composer root and uses the visible one", () => {
    const hiddenRoot = document.createElement("div");
    hiddenRoot.setAttribute("data-testid", "message-input-root");
    hiddenRoot.style.display = "none";
    const hidden = document.createElement("textarea");
    hidden.setAttribute("data-composer-input", "");
    hidden.value = "hidden";
    hiddenRoot.appendChild(hidden);
    document.body.appendChild(hiddenRoot);

    mountComposer("visible");
    const adapter = createWebComposerAdapter();
    expect(adapter.readText()).toBe("visible");
    expect(adapter.replaceText("replaced")).toBe(true);
    expect(hidden.value).toBe("hidden");
  });

  it("focuses the composer field", () => {
    const field = mountComposer("x");
    createWebComposerAdapter().focus();
    expect(document.activeElement).toBe(field);
  });
});
