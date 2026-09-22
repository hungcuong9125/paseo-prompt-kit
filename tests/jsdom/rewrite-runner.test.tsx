import { describe, expect, it, vi } from "vitest";
import { createRewriteRunner } from "../../client/pills/rewrite-runner.js";
import type { ComposerAdapter } from "../../client/composer-bridge/adapter.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";

const settings = promptKitSettingsSchema.parse({});

function adapter(overrides: Partial<ComposerAdapter> = {}): ComposerAdapter {
  return {
    isSupported: () => true,
    readText: () => "original",
    replaceText: () => true,
    focus: () => {},
    ...overrides,
  };
}

function runner(input: {
  adapter?: ComposerAdapter;
  rpc?: (contract: { name: string }, value: unknown) => Promise<unknown>;
  isActive?: () => boolean;
}) {
  return createRewriteRunner({
    adapter: input.adapter ?? adapter(),
    rpc: (input.rpc ?? (async () => ({ status: "ok", rewrittenPrompt: "improved", model: { provider: "x", model: null, thinkingOptionId: null }, durationMs: 1 }))) as never,
    readSettings: async () => ({ status: "ready", values: settings }),
    agentId: "agent-a",
    workspaceId: "ws-1",
    isActive: input.isActive ?? (() => true),
  });
}

describe("rewrite runner", () => {
  it("reports failure instead of success when the Composer cannot be updated", async () => {
    const focus = vi.fn();
    const current = runner({
      adapter: adapter({ replaceText: () => false, focus }),
    });
    await expect(current.run("coding")).rejects.toThrow(
      "PromptKit could not find the Composer to update.",
    );
    expect(focus).not.toHaveBeenCalled();
  });

  it("sends nothing but the rewrite RPC", async () => {
    const calls: string[] = [];
    const current = runner({
      rpc: async (contract) => {
        calls.push(contract.name);
        return {
          status: "ok",
          rewrittenPrompt: "improved",
          model: { provider: "x", model: null, thinkingOptionId: null },
          durationMs: 1,
        };
      },
    });
    await current.run("coding");
    expect(calls).toEqual(["prompt-kit.rewrite"]);
  });

  it("clears the busy flag after a failed attempt so the next run is allowed", async () => {
    let attempts = 0;
    const current = runner({
      rpc: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("daemon offline");
        return {
          status: "ok",
          rewrittenPrompt: "improved",
          model: { provider: "x", model: null, thinkingOptionId: null },
          durationMs: 1,
        };
      },
    });
    await expect(current.run("coding")).rejects.toThrow("daemon offline");
    expect(current.isBusy()).toBe(false);
    await expect(current.run("coding")).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });
});
