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
  rewriteResult: vi.fn(),
  listActions: vi.fn(),
  send: vi.fn(),
  settings: null as unknown,
}));

vi.mock("@getpaseo/plugin/client", () => ({
  useSettings: () => holder.settings,
  useRpc: (contract: { name: string }) => {
    if (contract.name === "prompt-kit.rewrite") return holder.rewrite;
    if (contract.name === "prompt-kit.rewrite.result") return holder.rewriteResult;
    return holder.listActions;
  },
  usePaseo: () => ({ agents: { ref: () => ({ send: holder.send }) } }),
}));

import { createRewriteSheet, forgetDrafts, forgetInFlightRewrites, type ComposerLocator } from "../../client/sheet/rewrite-sheet.js";
import { forgetLastRewrites, readLastRewrite } from "../../client/rewrite-records.js";
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
  actions: [{ id: "general", version: 1, enabledByDefault: true, title: "T", description: "D", icon: "I", custom: false }],
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
  holder.rewriteResult.mockReset();
  holder.listActions.mockReset();
  forgetInFlightRewrites();
  forgetDrafts();
  forgetLastRewrites();
  holder.send.mockReset();
  close.mockReset();
  toastCalls.length = 0;
});

describe("rewrite sheet with the Composer reachable", () => {
  it("does not clear a newer Composer draft after sending the sheet's text", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({ status: "ok", rewrittenPrompt: "improved" });
    const composer = fakeComposer("original");
    const view = await render(() => ({ ok: true, handle: composer.handle }));
    composer.state.text = "new human draft";
    holder.send.mockResolvedValue(undefined);
    await press(view, "prompt-kit-sheet-send");
    expect(holder.send).toHaveBeenCalledWith("improved");
    expect(composer.state.text).toBe("new human draft");
  });

  it("mirrors only the rewritten text into the Composer by default", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1, modelMs: 1,
    });
    holder.send.mockResolvedValue(undefined);
    const composer = fakeComposer("fix the login bug");
    const seen: string[] = [];
    const locate: ComposerLocator = (_probe, agentId) => {
      seen.push(agentId);
      return { ok: true, handle: composer.handle };
    };
    const view = await render(locate);

    // Two locate calls: one when the sheet opens, one fresh re-locate when
    // the rewrite lands (delivery must not trust the open-time handle).
    expect(seen).toEqual(["agent-1", "agent-1"]);
    expect(holder.rewrite).toHaveBeenCalledTimes(1);
    expect(holder.rewrite).toHaveBeenCalledWith(expect.objectContaining({ originalPrompt: "fix the login bug" }));
    expect(field(view).value).toBe("improved");
    // Default (composerIncludeOriginal off): the Composer shows ONLY the
    // rewritten text — desktop parity.
    expect(composer.state.text).toBe("improved");

    await press(view, "prompt-kit-sheet-send");
    expect(holder.send).toHaveBeenCalledWith("improved");
    // Send clears the Composer when it still holds what this sheet wrote there.
    expect(composer.state.text).toBe("");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("shows the original as a read-only block and keeps the Composer sendable", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1, modelMs: 1,
    });
    const composer = fakeComposer("fix the login bug");
    const locate: ComposerLocator = () => ({ ok: true, handle: composer.handle });
    const view = await render(locate);

    // The Composer carries what gets sent — the rewritten text only. The
    // original is reviewed in the sheet's read-only block, never sent
    // unfiltered through a host send button.
    expect(composer.state.text).toBe("improved");
    expect(field(view).value).toBe("improved");
    const block = view.querySelector('[data-testid="prompt-kit-sheet-original-block"]');
    expect(block).not.toBeNull();
    expect(block?.textContent).toContain("Original prompt");
    expect(block?.textContent).toContain("fix the login bug");
  });

  // The swap is a reversible view switch between the two recorded versions;
  // the Composer follows while it holds what the sheet put there.
  it("swaps between the rewrite and the original on demand, and back", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1, modelMs: 1,
    });
    const composer = fakeComposer("fix the login bug");
    const locate: ComposerLocator = () => ({ ok: true, handle: composer.handle });
    const view = await render(locate);
    const swapButton = () => view.querySelector<HTMLButtonElement>('[data-testid="prompt-kit-sheet-swap"]')!;

    expect(composer.state.text).toBe("improved");
    expect(swapButton().textContent).toContain("Use the original");
    await press(view, "prompt-kit-sheet-swap");
    expect(composer.state.text).toBe("fix the login bug");
    expect(field(view).value).toBe("fix the login bug");
    expect(swapButton().textContent).toContain("Back to the rewrite");
    await press(view, "prompt-kit-sheet-swap");
    expect(composer.state.text).toBe("improved");
    expect(field(view).value).toBe("improved");
  });

  // The user's own Composer edit is never overwritten by a swap.
  it("leaves an edited Composer alone when the swap is pressed", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1, modelMs: 1,
    });
    const composer = fakeComposer("fix the login bug");
    const locate: ComposerLocator = () => ({ ok: true, handle: composer.handle });
    const view = await render(locate);
    composer.state.text = "my own newer draft";

    await press(view, "prompt-kit-sheet-swap");
    expect(composer.state.text).toBe("my own newer draft");
    // The field still swaps (it is the sheet's own text).
    expect(field(view).value).toBe("fix the login bug");
  });

  // Content-drift regression: after a delivery, reopening the sheet on the
  // delivered text must not auto-rewrite the delivery again — every pill
  // press would rewrite the previous rewrite and the prompt would drift.
  it("does not auto-rewrite the text PromptKit itself delivered", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    let calls = 0;
    holder.rewrite.mockImplementation(async () => {
      calls += 1;
      return { status: "ok", rewrittenPrompt: `improved-${calls}` };
    });
    const composer = fakeComposer("abcd");
    const locate: ComposerLocator = () => ({ ok: true, handle: composer.handle });
    await render(locate);
    expect(holder.rewrite).toHaveBeenCalledTimes(1);
    expect(composer.state.text).toBe("improved-1");

    // Close and reopen on exactly the delivered text: the field resumes from
    // the rewritten text and no new rewrite is fired.
    await act(async () => root?.unmount());
    container?.remove();
    holder.listActions.mockResolvedValue(actions);
    const second = await render(locate);
    expect(field(second).value).toBe("improved-1");
    expect(holder.rewrite).toHaveBeenCalledTimes(1);
  });

  // The user editing the delivered text re-arms the auto-rewrite.
  it("auto-rewrites again when the user edited the delivered text", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockImplementation(async ({ originalPrompt }: { originalPrompt: string }) => ({
      status: "ok",
      rewrittenPrompt: `${originalPrompt}-done`,
    }));
    const composer = fakeComposer("abcd");
    const locate: ComposerLocator = () => ({ ok: true, handle: composer.handle });
    await render(locate);
    expect(composer.state.text).toBe("abcd-done");

    composer.state.text = "a brand new question";
    await act(async () => root?.unmount());
    container?.remove();
    holder.listActions.mockResolvedValue(actions);
    await render(locate);
    expect(holder.rewrite).toHaveBeenCalledTimes(2);
    expect(holder.rewrite).toHaveBeenLastCalledWith(expect.objectContaining({ originalPrompt: "a brand new question" }));
  });

  // Android delivery regression: the host can rebuild the Composer's fiber
  // while the rewrite runs, so delivery must re-locate and write through the
  // fresh handle — a stale open-time handle writes into a dead component and
  // the text never changes on screen.
  it("delivers through a freshly located Composer when the open-time handle went stale", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1, modelMs: 1,
    });
    const stale = fakeComposer("abcd");
    const fresh = fakeComposer("abcd");
    const freshReplace = vi.spyOn(fresh.handle, "replaceText");
    let call = 0;
    const locate: ComposerLocator = () => (call++ === 0 ? { ok: true, handle: stale.handle } : { ok: true, handle: fresh.handle });
    const view = await render(locate);

    expect(freshReplace).toHaveBeenCalledWith("improved");
    expect(fresh.state.text).toBe("improved");
    expect(stale.state.text).toBe("abcd"); // the dead component is left alone
    expect(field(view).value).toBe("improved");
  });

  // N2 regression: a second Rewrite inside the same sheet must deliver into
  // the Composer too — the delivery expectation follows the last delivery,
  // not the text the sheet opened with.
  it("delivers a second rewrite in the same sheet into the Composer", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockImplementation(async ({ originalPrompt }: { originalPrompt: string }) => ({
      status: "ok",
      rewrittenPrompt: `${originalPrompt}-improved`,
    }));
    const composer = fakeComposer("abcd");
    const locate: ComposerLocator = () => ({ ok: true, handle: composer.handle });
    const view = await render(locate);
    expect(composer.state.text).toBe("abcd-improved");

    await press(view, "prompt-kit-sheet-rewrite");
    expect(holder.rewrite).toHaveBeenCalledTimes(2);
    expect(composer.state.text).toBe("abcd-improved-improved");
    expect(field(view).value).toBe("abcd-improved-improved");
  });

  // M3 regression: with keep-original on, reopening the sheet resumes from
  // the rewritten text, so Send sends ONLY the rewritten text — never the
  // composed block with the marker and the original.
  it("sends the rewritten text after reopening and keeps the original for review", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1, modelMs: 1,
    });
    holder.send.mockResolvedValue(undefined);
    const composer = fakeComposer("abcd");
    const locate: ComposerLocator = () => ({ ok: true, handle: composer.handle });
    const first = await render(locate);
    expect(composer.state.text).toBe("improved");

    await act(async () => root?.unmount());
    container?.remove();
    holder.listActions.mockResolvedValue(actions);
    const second = await render(locate);
    // The field resumes from the delivered rewrite; the original is still on
    // record for review (the record survives the send).
    expect(field(second).value).toBe("improved");
    expect(second.querySelector('[data-testid="prompt-kit-sheet-original"]')?.textContent).toBe("abcd");
    await press(second, "prompt-kit-sheet-send");
    expect(holder.send).toHaveBeenCalledWith("improved");
    // The Composer held exactly the recorded rewrite, so Send clears it.
    expect(composer.state.text).toBe("");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite or touch the Composer when it is empty, and X leaves it alone", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
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
    holder.listActions.mockResolvedValue(actions);
    const view = await render(() => ({ ok: false, reason: "no_fiber" }));
    expect(view.querySelector('[data-testid="prompt-kit-sheet-note"]')?.textContent).toContain("component tree");
    expect(holder.rewrite).not.toHaveBeenCalled();
  });
});

describe("rewrite sheet with several enabled actions", () => {
  // Fails if the sheet runs the first action on open instead of letting the author choose.
  it("waits for a choice and runs the action that was pressed", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    const summary = actions.actions[0]!;
    holder.listActions.mockResolvedValue({
      actions: [summary, { ...summary, id: "plan-first", title: "Plan first", custom: true }],
      rejected: [],
    });
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "planned", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1, modelMs: 1,
    });
    const composer = fakeComposer("fix the login bug");
    const view = await render(() => ({ ok: true, handle: composer.handle }));

    expect(holder.rewrite).not.toHaveBeenCalled();
    expect(field(view).value).toBe("fix the login bug");
    expect(view.querySelector('[data-testid="prompt-kit-sheet-rewrite"]')).toBeNull();

    await press(view, "prompt-kit-sheet-action-plan-first");
    expect(holder.rewrite).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: "plan-first", originalPrompt: "fix the login bug" }),
    );
    expect(field(view).value).toBe("planned");
  });

  it("lays the action buttons out in two equal columns, keeping an empty cell on a short row", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    const summary = actions.actions[0]!;
    holder.listActions.mockResolvedValue({
      actions: [summary, { ...summary, id: "plan-first", title: "Plan first", custom: true }, { ...summary, id: "third", title: "Third", custom: true }],
      rejected: [],
    });
    const view = await render(notFound);
    const rows = view.querySelectorAll('[data-testid^="prompt-kit-sheet-action-"]');
    expect(rows).toHaveLength(3);
  });
});

describe("rewrite sheet run lifecycle", () => {
  it("rewrites the single field in place on keyboard submit, then sends and clears on Send", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({
      status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1, modelMs: 1,
    });
    holder.send.mockResolvedValue(undefined);
    const view = await render();

    await typeInto(view, "fix the login bug");
    await submitKeyboard(view);
    expect(holder.rewrite).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1", workspaceId: "ws-1", originalPrompt: "fix the login bug" }),
    );
    expect(holder.rewrite).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String) }));
    expect(field(view).value).toBe("improved");
    expect(holder.send).not.toHaveBeenCalled();

    await press(view, "prompt-kit-sheet-rewrite");
    expect(holder.rewrite).toHaveBeenCalledTimes(2);
    expect(holder.rewrite).toHaveBeenLastCalledWith(expect.objectContaining({ originalPrompt: "improved" }));

    await press(view, "prompt-kit-sheet-send");
    expect(holder.send).toHaveBeenCalledWith("improved");
    expect(close).toHaveBeenCalledTimes(1);
  });

  // H1 regression: a failed rewrite must not poison the per-agent registry —
  // the retry fires a NEW daemon rewrite instead of re-toasting the old error.
  it("fires a new rewrite after a failed one", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite
      .mockResolvedValueOnce({ status: "error", error: { code: "generation_failed", message: "the model had a bad day" } })
      .mockResolvedValueOnce({
        status: "ok", rewrittenPrompt: "second try", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1, modelMs: 1,
      });
    const view = await render(notFound);
    await typeInto(view, "hello");
    await press(view, "prompt-kit-sheet-rewrite");
    expect(toastCalls.some((call) => call.kind === "error")).toBe(true);

    await press(view, "prompt-kit-sheet-rewrite");
    expect(holder.rewrite).toHaveBeenCalledTimes(2);
    expect(field(view).value).toBe("second try");
  });

  it("keeps the text across close and reopen, and a failed rewrite leaves it untouched", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockResolvedValue({ status: "error", error: { code: "timeout", message: "unused" } });
    let view = await render();
    await typeInto(view, "draft text");
    await press(view, "prompt-kit-sheet-rewrite");
    expect(toastCalls.some((call) => call.kind === "error")).toBe(true);
    expect(field(view).value).toBe("draft text");

    await press(view, "prompt-kit-sheet-close");
    expect(close).toHaveBeenCalledTimes(1);
    act(() => root?.unmount());
    container?.remove();
    view = await render();
    expect(field(view).value).toBe("draft text");
    expect(holder.send).not.toHaveBeenCalled();
  });

  // 手机场景回归：改写进行中 sheet 被卸载（后台化/旋转），结果必须留在草稿里。
  it("keeps a rewrite that finishes after the sheet unmounted in the draft", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({ uiLanguage: "en" }), revision: "r1" };
    let resolveRewrite: (value: { status: "ok"; rewrittenPrompt: string }) => void = () => undefined;
    holder.rewrite.mockImplementation(
      () => new Promise((resolve) => { resolveRewrite = resolve; }),
    );
    holder.listActions.mockResolvedValue(actions);
    const view = await render(notFound);
    await typeInto(view, "hello");
    await press(view, "prompt-kit-sheet-rewrite");
    // The phone backgrounds the sheet mid-rewrite: unmount without a result.
    act(() => root?.unmount());
    resolveRewrite({ status: "ok", rewrittenPrompt: "rewritten" });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Reopen: the draft resumes from the rewritten text, not the original.
    const reopened = await render(notFound);
    expect(field(reopened).value).toBe("rewritten");
  });

  // Real timers: the budget under test (timeoutMs floor 1000 + 5 s slack) is
  // itself the behavior, so a ~6 s wait is unavoidable and deterministic.
  it("surfaces a visible timeout when the rewrite never settles", async () => {
    holder.settings = {
      status: "ready",
      values: promptKitSettingsSchema.parse({ uiLanguage: "en", timeoutMs: 1000 }),
      revision: "r1",
    };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockImplementation(() => new Promise<never>(() => undefined));
    holder.rewriteResult.mockImplementation(async (input: { requestId: string }) => ({
      status: "pending" as const,
      requestId: input.requestId,
    }));
    const view = await render(notFound);
    await typeInto(view, "hello");
    await press(view, "prompt-kit-sheet-rewrite");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 6_200));
    });
    expect(
      toastCalls.some((call) => call.kind === "error" && call.message.includes("did not answer within")),
    ).toBe(true);
    expect(field(view).value).toBe("hello");
  }, 12_000);

  // 回传丢失回归：rewrite 响应永不落定时，结果轮询兜底把改写文本送到 sheet。
  it("recovers the rewrite through the result poll when the response is lost", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({ uiLanguage: "en", timeoutMs: 1000 }), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockImplementation(() => new Promise<never>(() => undefined));
    holder.rewriteResult.mockImplementation(async (input: { requestId: string }) =>
      input.requestId === "captured-run"
        ? { status: "ok" as const, requestId: input.requestId, rewrittenPrompt: "polled result" }
        : { status: "pending" as const, requestId: input.requestId },
    );
    const view = await render(notFound);
    await typeInto(view, "hello");
    await press(view, "prompt-kit-sheet-rewrite");
    expect(field(view).value).toBe("hello");
    // The daemon records the verdict; the next poll tick delivers it.
    holder.rewriteResult.mockImplementation(async (input: { requestId: string }) => ({
      status: "ok" as const,
      requestId: input.requestId,
      rewrittenPrompt: "polled result",
    }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    });
    expect(field(view).value).toBe("polled result");
  }, 12_000);

  // M6 regression: a verdict from a different run of the same agent (another
  // surface or device) must read as pending — never delivered here.
  it("ignores a verdict that belongs to a different run", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({ uiLanguage: "en" }), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockImplementation(() => new Promise<never>(() => undefined));
    holder.rewriteResult.mockImplementation(async (input: { requestId: string }) => ({
      status: "ok" as const,
      requestId: `foreign-${input.requestId}`, // never matches
      rewrittenPrompt: "someone else's rewrite",
    }));
    const composer = fakeComposer("hello");
    const view = await render(() => ({ ok: true, handle: composer.handle }));
    // One auto-rewrite fires on open; the foreign verdict must not land.
    expect(holder.rewrite).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    });
    expect(composer.state.text).toBe("hello");
    expect(field(view).value).toBe("hello");
    expect(toastCalls.some((call) => call.kind === "error")).toBe(false);
  }, 12_000);

  // N4 regression: poll-delivered failures carry a code and are localized,
  // instead of surfacing the daemon's raw English sentence.
  it("localizes a poll-delivered failure", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({ uiLanguage: "en", timeoutMs: 1000 }), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    holder.rewrite.mockImplementation(() => new Promise<never>(() => undefined));
    holder.rewriteResult.mockImplementation(async (input: { requestId: string }) => ({
      status: "error" as const,
      requestId: input.requestId,
      error: { code: "timeout", message: "raw daemon sentence" },
    }));
    const view = await render(notFound);
    await typeInto(view, "hello");
    await press(view, "prompt-kit-sheet-rewrite");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    });
    expect(
      toastCalls.some((call) => call.kind === "error" && call.message.includes("did not answer within")),
    ).toBe(true);
    expect(toastCalls.some((call) => call.message === "raw daemon sentence")).toBe(false);
    expect(field(view).value).toBe("hello");
  }, 12_000);

  // 用户在改写期间编辑了 Composer：他们的编辑优先，改写结果不覆盖输入框。
  it("leaves the Composer alone when the user edited it while the rewrite ran", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    let resolveRewrite: (value: { status: "ok"; rewrittenPrompt: string }) => void = () => undefined;
    holder.rewrite.mockImplementation(
      () => new Promise((resolve) => { resolveRewrite = resolve; }),
    );
    holder.send.mockResolvedValue(undefined);
    const composer = fakeComposer("original");
    const view = await render(() => ({ ok: true, handle: composer.handle }));
    await typeInto(view, "hello");
    await press(view, "prompt-kit-sheet-rewrite");
    // The user edits the Composer while the rewrite is in flight.
    composer.state.text = "my own newer draft";
    resolveRewrite({ status: "ok", rewrittenPrompt: "rewritten" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The sheet shows the rewrite; the user's Composer edit is untouched.
    expect(field(view).value).toBe("rewritten");
    expect(composer.state.text).toBe("my own newer draft");
  });

  // 重开 sheet 附着到同一 agent 在跑的改写上：不重复发 RPC，结果经轮询送达。
  it("attaches a reopened sheet to the rewrite already running for the agent", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({ uiLanguage: "en" }), revision: "r1" };
    holder.rewrite.mockImplementation(() => new Promise<never>(() => undefined));
    holder.listActions.mockResolvedValue(actions);
    let polled = false;
    holder.rewriteResult.mockImplementation(async (input: { requestId: string }) =>
      polled
        ? { status: "ok" as const, requestId: input.requestId, rewrittenPrompt: "rewritten" }
        : { status: "pending" as const, requestId: input.requestId },
    );
    const first = await render(notFound);
    await typeInto(first, "hello");
    await press(first, "prompt-kit-sheet-rewrite");
    expect(holder.rewrite).toHaveBeenCalledTimes(1);
    // Close and reopen mid-rewrite: a fresh sheet instance, same agent.
    act(() => root?.unmount());
    container?.remove();
    const second = await render(notFound);
    await typeInto(second, "hello");
    await press(second, "prompt-kit-sheet-rewrite");
    // No duplicate daemon rewrite: the second sheet reused the running run.
    expect(holder.rewrite).toHaveBeenCalledTimes(1);
    polled = true;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    });
    expect(field(second).value).toBe("rewritten");
  }, 12_000);

  // H2 regression: reopening mid-rewrite with an EDITED Composer must not ride
  // the old run — the edit gets its own rewrite, and the old result never
  // overwrites the edit.
  it("rewrites the edited text instead of riding the old run when reopened mid-rewrite", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({}), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    let resolveFirst: (value: { status: "ok"; rewrittenPrompt: string }) => void = () => undefined;
    let resolveSecond: (value: { status: "ok"; rewrittenPrompt: string }) => void = () => undefined;
    holder.rewrite
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; }),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveSecond = resolve; }),
      );
    const composer = fakeComposer("abcd");
    const locate: ComposerLocator = () => ({ ok: true, handle: composer.handle });
    const first = await render(locate);
    expect(holder.rewrite).toHaveBeenCalledTimes(1);
    expect(holder.rewrite).toHaveBeenLastCalledWith(expect.objectContaining({ originalPrompt: "abcd" }));

    // Close, edit the Composer, reopen before the old run settles.
    act(() => root?.unmount());
    container?.remove();
    composer.state.text = "a brand new question";
    holder.listActions.mockResolvedValue(actions);
    const second = await render(locate);
    // The edited text is rewritten by a NEW run, not by riding the old one.
    expect(holder.rewrite).toHaveBeenCalledTimes(2);
    expect(holder.rewrite).toHaveBeenLastCalledWith(expect.objectContaining({ originalPrompt: "a brand new question" }));

    // The old run settling late must not overwrite the user's edit.
    resolveFirst({ status: "ok", rewrittenPrompt: "old result" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(composer.state.text).toBe("a brand new question");

    // The new run's result is delivered for the edited text.
    resolveSecond({ status: "ok", rewrittenPrompt: "better" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(composer.state.text).toBe("better");
    expect(field(second).value).toBe("better");
  });

  // The unmounted-delivery path writes the rewritten text only: the original
  // is never pushed into the send surface, even after the sheet is gone.
  it("delivers the rewritten text into the Composer when the sheet closed before the rewrite finished", async () => {
    holder.settings = { status: "ready", values: promptKitSettingsSchema.parse({ uiLanguage: "en" }), revision: "r1" };
    holder.listActions.mockResolvedValue(actions);
    let resolveRewrite: (value: { status: "ok"; rewrittenPrompt: string }) => void = () => undefined;
    holder.rewrite.mockImplementation(
      () => new Promise((resolve) => { resolveRewrite = resolve; }),
    );
    const composer = fakeComposer("fix the login bug");
    const locate: ComposerLocator = () => ({ ok: true, handle: composer.handle });
    const view = await render(locate);
    await press(view, "prompt-kit-sheet-rewrite");
    // The user closes the sheet before the rewrite finishes.
    act(() => root?.unmount());
    resolveRewrite({ status: "ok", rewrittenPrompt: "the polished prompt" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The Composer holds the rewritten text only; the original stays on
    // record for review (and a later swap on desktop).
    expect(composer.state.text).toBe("the polished prompt");
    expect(readLastRewrite("agent-1")).toEqual({
      rewritten: "the polished prompt",
      original: "fix the login bug",
    });
  });
});
