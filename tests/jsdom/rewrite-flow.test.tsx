import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => (await import("./mocks.js")).reactNativeMock);
vi.mock(
  "@getpaseo/plugin/client/ui",
  async () => (await import("./mocks.js")).pluginUiMock,
);

import contribute from "../../client/contribute.js";
import { promptKitSettingsSchema, type PromptKitSettings } from "../../shared/settings.js";
import { createWebComposerAdapter } from "../../client/composer/web.js";
import { createFakeClient, mountComposer, unmountComposer } from "./fakes.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const agent = { id: "agent-a", workspaceId: "ws-1" };

const settings: PromptKitSettings = promptKitSettingsSchema.parse({});

type RpcResult = Record<string, unknown>;

function itemPress(pill: {
  button: Record<string, unknown>;
}): () => void | Promise<void> {
  const behavior = pill.button.behavior as {
    items: { behavior: { onPress(): void | Promise<void> } }[];
  };
  return behavior.items[0]!.behavior.onPress;
}

async function mountWithRewrite(
  rpc: (method: string, input: unknown) => Promise<RpcResult>,
  composerText: string,
  agentValue: { id: string; workspaceId: string } = agent,
) {
  const fake = createFakeClient({
    agents: [agentValue],
    rpc: async (method, input) => {
      if (method === "settings.prompt-kit.read") {
        return { status: "ready", revision: "r1", values: settings };
      }
      return rpc(method, input);
    },
  });
  const cleanup = contribute(fake.client);
  await flush();
  mountComposer(composerText);
  return { fake, cleanup };
}

function rewriteCalls(fake: { rpcCalls: { method: string; input: unknown }[] }) {
  return fake.rpcCalls.filter((call) => call.method === "prompt-kit.rewrite");
}

afterEach(() => {
  unmountComposer();
  vi.restoreAllMocks();
});

describe("rewrite flow", () => {
  it("replaces the composer text, restores focus, and never sends", async () => {
    const fake = await mountWithRewrite(
      async () => ({ status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 5 }),
      "  write tests  ",
    );
    const field = document.querySelector("textarea")!;
    field.blur();

    await itemPress(fake.fake.live()[0]!)();

    expect(field.value).toBe("improved");
    expect(document.activeElement).toBe(field);
    expect(fake.fake.sent).toBe(0);
    expect(rewriteCalls(fake.fake)).toHaveLength(1);
    expect(rewriteCalls(fake.fake)[0]!.input).toMatchObject({
      actionId: "coding",
      agentId: "agent-a",
      workspaceId: "ws-1",
      originalPrompt: "  write tests  ",
      settings,
    });
    fake.cleanup();
  });

  it("does not call the rewrite RPC for empty or whitespace input", async () => {
    const fake = await mountWithRewrite(async () => ({}), "   \n  ");
    await expect(itemPress(fake.fake.live()[0]!)()).rejects.toThrow("Write a prompt first.");
    expect(rewriteCalls(fake.fake)).toHaveLength(0);
    expect(document.querySelector("textarea")!.value).toBe("   \n  ");
    fake.cleanup();
  });

  it("keeps the original text when the RPC returns an error result", async () => {
    const fake = await mountWithRewrite(
      async () => ({ status: "error", error: { code: "timeout", message: "The rewrite timed out." } }),
      "keep me",
    );
    await expect(itemPress(fake.fake.live()[0]!)()).rejects.toThrow("The rewrite timed out.");
    expect(document.querySelector("textarea")!.value).toBe("keep me");
    fake.cleanup();
  });

  it("keeps the original text when the RPC itself rejects", async () => {
    const fake = await mountWithRewrite(async () => {
      throw new Error("daemon offline");
    }, "keep me");
    await expect(itemPress(fake.fake.live()[0]!)()).rejects.toThrow("daemon offline");
    expect(document.querySelector("textarea")!.value).toBe("keep me");
    fake.cleanup();
  });

  it("does not overwrite text the user edited while the request was running", async () => {
    const pendingRewrite = deferred<RpcResult>();
    const fake = await mountWithRewrite(() => pendingRewrite.promise, "original");
    const field = document.querySelector("textarea")!;

    const pending = itemPress(fake.fake.live()[0]!)();
    await flush();
    field.value = "user typed this";
    pendingRewrite.resolve({ status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1 });

    await expect(pending).rejects.toThrow("The prompt changed while PromptKit was rewriting");
    expect(field.value).toBe("user typed this");
    fake.cleanup();
  });

  it("blocks re-entry while a rewrite is in flight", async () => {
    const pendingRewrite = deferred<RpcResult>();
    const fake = await mountWithRewrite(() => pendingRewrite.promise, "original");
    const press = itemPress(fake.fake.live()[0]!);
    const first = press();
    await flush();
    await expect(press()).rejects.toThrow("already rewriting");
    expect(rewriteCalls(fake.fake)).toHaveLength(1);

    pendingRewrite.resolve({ status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1 });
    await first;
    expect(document.querySelector("textarea")!.value).toBe("improved");
    fake.cleanup();
  });

  it("refuses to run with an incomplete dedicated selection", async () => {
    const fake = createFakeClient({
      agents: [agent],
      rpc: async (method) => {
        if (method === "settings.prompt-kit.read") {
          return {
            status: "ready",
            revision: "r1",
            values: { ...settings, modelMode: "dedicated", dedicatedProvider: "openai" },
          };
        }
        throw new Error(`unexpected rpc ${method}`);
      },
    });
    const cleanup = contribute(fake.client);
    await flush();
    mountComposer("keep me");

    await expect(itemPress(fake.live()[0]!)()).rejects.toThrow("dedicated provider and model");
    expect(rewriteCalls(fake)).toHaveLength(0);
    expect(document.querySelector("textarea")!.value).toBe("keep me");
    cleanup();
  });

  it("refuses to run a dedicated selection that is no longer in the provider catalog", async () => {
    const fake = createFakeClient({
      agents: [agent],
      rpc: async (method) => {
        if (method === "settings.prompt-kit.read") {
          return {
            status: "ready",
            revision: "r1",
            values: {
              ...settings,
              modelMode: "dedicated",
              dedicatedProvider: "ghost",
              dedicatedModel: "gone",
            },
          };
        }
        if (method === "prompt-kit.providers") {
          return {
            providers: [
              { provider: "ghost", label: "Ghost", available: false, models: [] },
            ],
          };
        }
        throw new Error(`unexpected rpc ${method}`);
      },
    });
    const cleanup = contribute(fake.client);
    await flush();
    mountComposer("keep me");

    await expect(itemPress(fake.live()[0]!)()).rejects.toThrow("Provider is unavailable: ghost");
    expect(rewriteCalls(fake)).toHaveLength(0);
    expect(document.querySelector("textarea")!.value).toBe("keep me");
    cleanup();
  });

  it("refuses to run when the settings document cannot be read", async () => {
    const fake = createFakeClient({
      agents: [agent],
      rpc: async (method) => {
        if (method === "settings.prompt-kit.read") {
          return { status: "invalid", revision: "r1", error: "stored document is corrupt" };
        }
        throw new Error(`unexpected rpc ${method}`);
      },
    });
    const cleanup = contribute(fake.client);
    await flush();
    mountComposer("keep me");

    await expect(itemPress(fake.live()[0]!)()).rejects.toThrow("stored document is corrupt");
    expect(rewriteCalls(fake)).toHaveLength(0);
    cleanup();
  });

  it("refuses to replace when the visible composer is gone", async () => {
    const fake = await mountWithRewrite(
      async () => ({ status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1 }),
      "original",
    );
    const press = itemPress(fake.fake.live()[0]!);
    unmountComposer();
    await expect(press()).rejects.toThrow("one visible Composer");
    fake.cleanup();
  });

  it("does not apply a result after the pill's agent was removed", async () => {
    const pendingRewrite = deferred<RpcResult>();
    const fake = await mountWithRewrite(() => pendingRewrite.promise, "original");
    const field = document.querySelector("textarea")!;
    const press = itemPress(fake.fake.live()[0]!)();
    await flush();

    fake.fake.removeAgent("agent-a");
    pendingRewrite.resolve({ status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1 });

    await expect(press).rejects.toThrow("no longer available");
    expect(field.value).toBe("original");
    fake.cleanup();
  });

  it("reads the composer through the frozen web adapter", async () => {
    mountComposer("adapter text");
    expect(createWebComposerAdapter().readText()).toBe("adapter text");
  });
});
