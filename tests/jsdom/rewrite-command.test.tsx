import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => (await import("./mocks.js")).reactNativeMock);
vi.mock("@getpaseo/plugin/client/ui", async () => (await import("./mocks.js")).pluginUiMock);

import contribute from "../../index.client.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";
import { createFakeClient, mountComposer, unmountComposer } from "./fakes.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(unmountComposer);

function commandContext(rpc: (method: string, input: unknown) => Promise<unknown>, args: string) {
  return {
    context: "workspace",
    workspace: { id: "ws-1", directory: "/tmp/ws" },
    args,
    rpc: (contract: { name: string }, input: unknown) => rpc(contract.name, input),
  };
}

describe("/rewrite slash command", () => {
  it("registers in workspace scope so a draft seat can use it", async () => {
    const fake = createFakeClient({ agents: [] });
    const cleanup = contribute(fake.client);
    await flush();
    expect(fake.slashCommands.map((command) => [command.name, command.context])).toEqual([
      ["rewrite", "workspace"],
    ]);
    cleanup();
    expect(fake.slashCommands).toHaveLength(0);
  });

  it("rewrites the typed text with no agent id and inserts it into the empty Composer", async () => {
    const values = promptKitSettingsSchema.parse({});
    const calls: { method: string; input: unknown }[] = [];
    const rpc = async (method: string, input: unknown) => {
      calls.push({ method, input });
      if (method === "settings.prompt-kit.read") return { status: "ready", revision: "r1", values };
      if (method === "prompt-kit.rewrite") {
        return {
          status: "ok",
          rewrittenPrompt: "improved",
          model: { provider: "x", model: null, thinkingOptionId: null },
          durationMs: 1,
        };
      }
      throw new Error(`unexpected rpc ${method}`);
    };
    const fake = createFakeClient({ agents: [], rpc });
    const cleanup = contribute(fake.client);
    await flush();
    const field = mountComposer("");

    await fake.slashCommands[0]!.onSubmit(commandContext(rpc, "fix the login bug"));

    const rewrite = calls.find((call) => call.method === "prompt-kit.rewrite")!;
    expect(rewrite.input).toMatchObject({ agentId: null, workspaceId: "ws-1", originalPrompt: "fix the login bug" });
    expect(field.value).toBe("improved");
    expect(fake.sent).toBe(0);
    cleanup();
  });

  it("refuses an empty prompt and never calls the daemon", async () => {
    const values = promptKitSettingsSchema.parse({});
    const calls: string[] = [];
    const rpc = async (method: string) => {
      calls.push(method);
      if (method === "settings.prompt-kit.read") return { status: "ready", revision: "r1", values };
      throw new Error(`unexpected rpc ${method}`);
    };
    const fake = createFakeClient({ agents: [], rpc });
    const cleanup = contribute(fake.client);
    await flush();
    mountComposer("");
    await expect(fake.slashCommands[0]!.onSubmit(commandContext(rpc, "   "))).rejects.toThrow(
      "Write a prompt after /rewrite.",
    );
    expect(calls).not.toContain("prompt-kit.rewrite");
    cleanup();
  });

  it("puts the prompt back into the emptied Composer at once and replaces it when done", async () => {
    const values = promptKitSettingsSchema.parse({});
    const field = mountComposer("");
    let seenDuringRewrite = "";
    const rpc = async (method: string) => {
      if (method === "settings.prompt-kit.read") return { status: "ready", revision: "r1", values };
      if (method === "prompt-kit.rewrite") {
        seenDuringRewrite = field.value;
        expect(document.querySelector("[data-prompt-kit-effect]")).not.toBeNull();
        expect(field.style.opacity).toBe("0.45");
        return {
          status: "ok",
          rewrittenPrompt: "improved",
          model: { provider: "x", model: null, thinkingOptionId: null },
          durationMs: 1,
        };
      }
      throw new Error(`unexpected rpc ${method}`);
    };
    const fake = createFakeClient({ agents: [], rpc });
    const cleanup = contribute(fake.client);
    await flush();
    await fake.slashCommands[0]!.onSubmit(commandContext(rpc, "fix it"));
    expect(seenDuringRewrite).toBe("/rewrite fix it");
    expect(field.value).toBe("improved");
    expect(document.querySelector("[data-prompt-kit-effect]")).toBeNull();
    cleanup();
  });

  it("leaves the prompt in the Composer when the rewrite fails", async () => {
    const values = promptKitSettingsSchema.parse({});
    const field = mountComposer("");
    const rpc = async (method: string) => {
      if (method === "settings.prompt-kit.read") return { status: "ready", revision: "r1", values };
      if (method === "prompt-kit.rewrite") {
        return { status: "error", error: { code: "timeout", message: "The rewrite timed out." } };
      }
      throw new Error(`unexpected rpc ${method}`);
    };
    const fake = createFakeClient({ agents: [], rpc });
    const cleanup = contribute(fake.client);
    await flush();
    await expect(fake.slashCommands[0]!.onSubmit(commandContext(rpc, "fix it"))).rejects.toThrow("timed out");
    expect(field.value).toBe("/rewrite fix it");
    expect(document.querySelector("[data-prompt-kit-effect]")).toBeNull();
    cleanup();
  });

  it("keeps text the user typed during the rewrite instead of overwriting it", async () => {
    const values = promptKitSettingsSchema.parse({});
    const field = mountComposer("");
    const rpc = async (method: string) => {
      if (method === "settings.prompt-kit.read") return { status: "ready", revision: "r1", values };
      if (method === "prompt-kit.rewrite") {
        field.value = "user kept typing";
        return {
          status: "ok",
          rewrittenPrompt: "improved",
          model: { provider: "x", model: null, thinkingOptionId: null },
          durationMs: 1,
        };
      }
      throw new Error(`unexpected rpc ${method}`);
    };
    const fake = createFakeClient({ agents: [], rpc });
    const cleanup = contribute(fake.client);
    await flush();
    await expect(fake.slashCommands[0]!.onSubmit(commandContext(rpc, "fix it"))).rejects.toThrow(
      "your text was kept",
    );
    expect(field.value).toBe("user kept typing");
    cleanup();
  });

  it("points to the pill where no Composer DOM exists", async () => {
    const values = promptKitSettingsSchema.parse({});
    const web = await import("../../client/composer-bridge/web.js");
    const real = web.createWebComposerAdapter;
    const supported = vi.spyOn(web, "createWebComposerAdapter").mockImplementation(() => ({
      ...real(),
      isSupported: () => false,
    }));
    const calls: string[] = [];
    const rpc = async (method: string) => {
      calls.push(method);
      if (method === "settings.prompt-kit.read") return { status: "ready", revision: "r1", values };
      throw new Error(`unexpected rpc ${method}`);
    };
    const { registerRewriteCommand } = await import("../../client/commands/rewrite-command.js");
    const { listActions } = await import("../../shared/action-registry/registry.js");
    const fake = createFakeClient({ agents: [], rpc });
    const cleanup = registerRewriteCommand(fake.client, {
      listActions: async () => listActions(),
      readSettings: async () => ({ status: "ready", values }),
    });
    await expect(fake.slashCommands[0]!.onSubmit(commandContext(rpc, "fix it"))).rejects.toThrow(
      "press the PromptKit pill",
    );
    expect(calls).not.toContain("prompt-kit.rewrite");
    cleanup();
    supported.mockRestore();
  });
});
