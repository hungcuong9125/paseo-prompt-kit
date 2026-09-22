import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { promptKitSettingsSchema } from "../../shared/settings.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", async () => (await import("./mocks.js")).reactNativeMock);
vi.mock("@getpaseo/plugin/client/ui", async () => (await import("./mocks.js")).pluginUiMock);
vi.mock("@getpaseo/plugin/client/react-native", async () => (await import("./mocks.js")).pluginReactNativeMock);

const holder = vi.hoisted(() => ({
  rewrite: vi.fn(),
  listActions: vi.fn(),
  send: vi.fn(),
  settings: null as unknown,
}));

vi.mock("@getpaseo/plugin/client", () => ({
  useSettings: () => holder.settings,
  useRpc: (contract: { name: string }) =>
    contract.name === "prompt-kit.rewrite" ? holder.rewrite : holder.listActions,
  usePaseo: () => ({ agents: { ref: () => ({ send: holder.send }) } }),
}));

import { createRewriteSheet, type ComposerLocator } from "../../client/sheet/rewrite-sheet.js";
import { toastCalls } from "./mocks.js";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";

const close = vi.fn();
const props = {
  context: "agent",
  workspaceId: "ws-1",
  agentId: "agent-1",
  close,
  theme: {
    colors: {
      surface0: "#000", surface1: "#111", surface2: "#222", border: "#333", foreground: "#fff",
      foregroundMuted: "#999", accent: "#0af", accentForeground: "#000",
      statusSuccess: "#0f0", statusWarning: "#ff0", statusDanger: "#f00",
    },
  },
  host: { id: "h", label: "Local" },
  layout: { compact: true, platform: "android" },
} as unknown as PluginButtonContentProps;

const actions = {
  actions: [{ id: "general", version: 1, enabledByDefault: true, title: "T", description: "D", icon: "I" }],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

/** A stand-in for the host Composer's imperative handle. */
function fakeComposer(initial: string) {
  const state = { text: initial, focused: 0 };
  const handle = {
    getText: () => state.text,
    replaceText: (next: string) => {
      state.text = next;
    },
    focus: () => {
      state.focused += 1;
    },
    getInputSnapshot: () => ({ text: state.text }),
  };
  return { state, handle };
}

const notFound: ComposerLocator = () => ({ ok: false, reason: "not_found" });

async function render(locate: ComposerLocator = notFound) {
  const RewriteSheet = createRewriteSheet(locate);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<RewriteSheet {...props} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

function field(view: HTMLElement) {
  return view.querySelector<HTMLTextAreaElement>('[data-testid="prompt-kit-sheet-input"]')!;
}

async function typeInto(view: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(field(view), value);
    field(view).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(view: HTMLElement, testId: string) {
  await act(async () => {
    view.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function submitKeyboard(view: HTMLElement) {
  await act(async () => {
    field(view).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  holder.rewrite.mockReset();
  holder.listActions.mockReset();
  holder.send.mockReset();
  close.mockReset();
  toastCalls.length = 0;
});

describe("rewrite sheet with the Composer reachable", () => {
  it("opens with the Composer text, rewrites it at once, and clears the Composer on Send", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1,
    });
    holder.send.mockResolvedValue(undefined);
    const composer = fakeComposer("fix the login bug");
    const seen: string[] = [];
    const locate: ComposerLocator = (_probe, agentId) => {
      seen.push(agentId);
      return { ok: true, handle: composer.handle };
    };
    const view = await render(locate);

    expect(seen).toEqual(["agent-1"]);
    expect(holder.rewrite).toHaveBeenCalledTimes(1);
    expect(holder.rewrite).toHaveBeenCalledWith(expect.objectContaining({ originalPrompt: "fix the login bug" }));
    expect(field(view).value).toBe("improved");
    // The Composer itself is untouched until Send.
    expect(composer.state.text).toBe("fix the login bug");

    await press(view, "prompt-kit-sheet-send");
    expect(holder.send).toHaveBeenCalledWith("improved");
    expect(composer.state.text).toBe("");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite or touch the Composer when it is empty, and X leaves it alone", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    const composer = fakeComposer("");
    const view = await render(() => ({ ok: true, handle: composer.handle }));
    expect(holder.rewrite).not.toHaveBeenCalled();
    expect(field(view).value).toBe("");
    await press(view, "prompt-kit-sheet-close");
    expect(close).toHaveBeenCalledTimes(1);
    expect(composer.state.text).toBe("");
  });

  it("explains when the Composer cannot be located and stays usable by hand", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    const view = await render(() => ({ ok: false, reason: "no_fiber" }));
    expect(view.querySelector('[data-testid="prompt-kit-sheet-note"]')?.textContent).toContain("component tree");
    expect(holder.rewrite).not.toHaveBeenCalled();
  });
});

describe("rewrite sheet", () => {
  it("rewrites the single field in place on keyboard submit, then sends and clears on Send", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1,
    });
    holder.send.mockResolvedValue(undefined);
    const view = await render();

    await typeInto(view, "fix the login bug");
    await submitKeyboard(view);
    expect(holder.rewrite).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1", workspaceId: "ws-1", originalPrompt: "fix the login bug" }),
    );
    expect(field(view).value).toBe("improved");
    expect(holder.send).not.toHaveBeenCalled();

    await press(view, "prompt-kit-sheet-rewrite");
    expect(holder.rewrite).toHaveBeenLastCalledWith(expect.objectContaining({ originalPrompt: "improved" }));

    await press(view, "prompt-kit-sheet-send");
    expect(holder.send).toHaveBeenCalledWith("improved");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the text across close and reopen, and a failed rewrite leaves it untouched", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({ status: "error", error: { code: "timeout", message: "The rewrite timed out." } });
    let view = await render();
    await typeInto(view, "draft text");
    await press(view, "prompt-kit-sheet-rewrite");
    expect(toastCalls).toContainEqual({ kind: "error", message: "The rewrite timed out." });
    expect(field(view).value).toBe("draft text");

    await press(view, "prompt-kit-sheet-close");
    expect(close).toHaveBeenCalledTimes(1);
    act(() => root?.unmount());
    container?.remove();
    view = await render();
    expect(field(view).value).toBe("draft text");
    expect(holder.send).not.toHaveBeenCalled();
  });
});
