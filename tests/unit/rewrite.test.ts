import { describe, expect, it } from "vitest";
import { runRewrite } from "../../server/rewrite.js";
import {
  cliStdout,
  createRewriteHarness,
  REWRITE_REQUEST,
  settings,
} from "../server/harness.js";

/** The scratch dir must exist while the CLI runs; the assertion needs a live check. */
async function rewrite(harness: ReturnType<typeof createRewriteHarness>, overrides = {}) {
  return runRewrite(harness.paseo, REWRITE_REQUEST, {
    settings: await settings(overrides),
    spawn: harness.spawn,
  });
}

describe("runRewrite: current model", () => {
  it("runs the provider's CLI with the agent's model and returns the text", async () => {
    const harness = createRewriteHarness({});
    const output = await rewrite(harness);

    expect(output.status).toBe("ok");
    if (output.status !== "ok") throw new Error("expected ok");
    expect(output.rewrittenPrompt).toBe("rewritten text");
    expect(output.model).toEqual({
      provider: "pi-peer",
      model: "workbuddy/deepseek-v4.1-flash",
      thinkingOptionId: "high",
    });
    expect(harness.spawned).toHaveLength(1);
    expect(harness.spawned[0]?.command).toBe("pi");
    expect(harness.spawned[0]?.args).toContain("workbuddy/deepseek-v4.1-flash");
    // The primary conversation is read once and never written.
    expect(harness.mainAgentCalls).toEqual(["refresh"]);
  });

  // The prompt must reach the CLI out of band, never as a command-line argument.
  it("never puts the prompt in argv", async () => {
    const harness = createRewriteHarness({});
    await rewrite(harness);
    const run = harness.spawned[0]!;
    expect(run.stdin).toBeNull();
    for (const arg of run.args) expect(arg).not.toContain("fix the bug");
    for (const arg of run.args) expect(arg).not.toContain("<user_prompt>");
  });

  it("runs the CLI in an empty scratch directory, not the workspace", async () => {
    const harness = createRewriteHarness({});
    await rewrite(harness);
    expect(harness.scratchDirs[0]).not.toBe("/tmp/workspace");
  });

  it("splits a provider selector that already carries the model", async () => {
    const harness = createRewriteHarness({
      agent: {
        provider: "pi-peer",
        runtimeInfo: { provider: "pi-peer/workbuddy/deepseek-v4.1-flash" },
      },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.args).toContain("workbuddy/deepseek-v4.1-flash");
  });

  it("resolves a role-scoped provider id to its CLI", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "codex-peer", runtimeInfo: { provider: "codex-peer" }, model: "gpt-5.6-luna" },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.command).toBe("codex");
    expect(harness.spawned[0]?.args).toContain("gpt-5.6-luna");
  });

  it("uses an explicit provider mapping when the id names no CLI", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "compat-peer", runtimeInfo: { provider: "compat-peer" } },
    });
    const output = await rewrite(harness, { providerCli: { "compat-peer": "opencode" } });
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.command).toBe("opencode");
  });

  it("fails closed on a provider that names no supported CLI and runs nothing", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "grok-peer", runtimeInfo: { provider: "grok-peer" } },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("unsupported_provider");
    expect(harness.spawned).toEqual([]);
  });

  it("fails closed when the current agent is gone and runs nothing", async () => {
    const harness = createRewriteHarness({});
    harness.paseo.agents.ref = () => ({ id: "agent-1", refresh: async () => null }) as never;
    const output = await rewrite(harness);
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_selection");
    expect(harness.spawned).toEqual([]);
  });

  it("fails closed when the agent has no model selected", async () => {
    const harness = createRewriteHarness({
      agent: { model: null, effectiveThinkingOptionId: null, thinkingOptionId: null },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_selection");
    expect(harness.spawned).toEqual([]);
  });
});

describe("runRewrite: CLI failure paths", () => {
  it("maps a CLI timeout to a timeout error and never replaces the composer", async () => {
    const harness = createRewriteHarness({
      cliResult: { stdout: "", timedOut: true, exitCode: null },
    });
    const output = await rewrite(harness, { timeoutMs: 2_000 });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("timeout");
  });

  it("maps an unusable CLI answer to empty_output", async () => {
    const harness = createRewriteHarness({ cliResult: { stdout: "" } });
    const output = await rewrite(harness);
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("empty_output");
  });

  it("maps a CLI that could not start to spawn_failed", async () => {
    const harness = createRewriteHarness({});
    const failing = { ...harness, spawn: async () => { throw new Error("ENOENT"); } };
    const output = await runRewrite(failing.paseo, REWRITE_REQUEST, {
      settings: await settings(),
      spawn: failing.spawn,
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("spawn_failed");
  });

  // A lossy rewrite must be refused even though the CLI exited cleanly.
  it("refuses output that dropped a protected literal", async () => {
    const harness = createRewriteHarness({
      cliResult: { stdout: cliStdout("run the tests") },
    });
    const output = await runRewrite(
      harness.paseo,
      { ...REWRITE_REQUEST, originalPrompt: "fix /tmp/app/login.ts" },
      { settings: await settings(), spawn: harness.spawn },
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("protected_literal_loss");
  });
});

describe("runRewrite: dedicated model", () => {
  it("uses the dedicated model's CLI when selected and available", async () => {
    const harness = createRewriteHarness({
      models: [{ provider: "claude", available: true, models: ["claude-haiku-4-5"], thinking: ["low"] }],
    });
    const output = await rewrite(harness, {
      modelMode: "dedicated",
      dedicatedProvider: "claude",
      dedicatedModel: "claude-haiku-4-5",
      dedicatedThinkingOptionId: "low",
    });
    expect(output.status).toBe("ok");
    if (output.status !== "ok") throw new Error("expected ok");
    expect(output.model).toEqual({
      provider: "claude",
      model: "claude-haiku-4-5",
      thinkingOptionId: "low",
    });
    expect(harness.spawned[0]?.command).toBe("claude");
    expect(harness.spawned[0]?.args).toContain("claude-haiku-4-5");
    expect(harness.spawned[0]?.stdin).toBe(REWRITE_REQUEST.taskPrompt);
  });

  it("uses the dedicated CLI even when the current agent runs a different one", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "pi-peer", runtimeInfo: { provider: "pi-peer" } },
      models: [{ provider: "codex", available: true, models: ["gpt-5.6-luna"] }],
    });
    const output = await rewrite(harness, {
      modelMode: "dedicated",
      dedicatedProvider: "codex",
      dedicatedModel: "gpt-5.6-luna",
    });
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.command).toBe("codex");
  });

  it("fails closed when the dedicated provider is unavailable", async () => {
    const harness = createRewriteHarness({
      models: [{ provider: "claude", available: false, models: ["claude-haiku-4-5"] }],
    });
    const output = await rewrite(harness, {
      modelMode: "dedicated",
      dedicatedProvider: "claude",
      dedicatedModel: "claude-haiku-4-5",
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_model");
    expect(harness.spawned).toEqual([]);
  });

  it("fails closed when the dedicated model is not in the catalog", async () => {
    const harness = createRewriteHarness({
      models: [{ provider: "claude", available: true, models: ["claude-haiku-4-5"] }],
    });
    const output = await rewrite(harness, {
      modelMode: "dedicated",
      dedicatedProvider: "claude",
      dedicatedModel: "claude-opus-5",
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_model");
    expect(harness.spawned).toEqual([]);
  });

  it("fails closed when a stale thinking option is selected", async () => {
    const harness = createRewriteHarness({
      models: [{ provider: "claude", available: true, models: ["claude-haiku-4-5"], thinking: ["low"] }],
    });
    const output = await rewrite(harness, {
      modelMode: "dedicated",
      dedicatedProvider: "claude",
      dedicatedModel: "claude-haiku-4-5",
      dedicatedThinkingOptionId: "max",
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_model");
  });

  it("fails closed when the dedicated provider names no supported CLI", async () => {
    const harness = createRewriteHarness({
      models: [{ provider: "grok", available: true, models: ["grok-4"] }],
    });
    const output = await rewrite(harness, {
      modelMode: "dedicated",
      dedicatedProvider: "grok",
      dedicatedModel: "grok-4",
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("unsupported_provider");
    expect(harness.spawned).toEqual([]);
  });

  it("fails closed when no dedicated selection is complete", async () => {
    const harness = createRewriteHarness({});
    const output = await rewrite(harness, { modelMode: "dedicated" });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_selection");
    expect(harness.spawned).toEqual([]);
  });
});
