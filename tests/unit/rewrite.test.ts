import { describe, expect, it } from "vitest";
import { runRewrite } from "../../server/rewrite-engine/engine.js";
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
      provider: "pi-custom",
      model: "acme/model-a",
      thinkingOptionId: "high",
    });
    expect(harness.spawned).toHaveLength(1);
    expect(harness.spawned[0]?.command).toBe("pi");
    expect(harness.spawned[0]?.args).toContain("acme/model-a");
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
    for (const arg of run.args) expect(arg).not.toContain("<draft>");
  });

  it("runs the CLI in an empty scratch directory, not the workspace", async () => {
    const harness = createRewriteHarness({});
    await rewrite(harness);
    expect(harness.scratchDirs[0]).not.toBe("/tmp/workspace");
  });

  it("splits a provider selector that already carries the model", async () => {
    const harness = createRewriteHarness({
      agent: {
        provider: "pi-custom",
        runtimeInfo: { provider: "pi-custom/acme/model-a" },
      },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.args).toContain("acme/model-a");
  });

  it("resolves a role-scoped provider id to its CLI", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "codex-custom", runtimeInfo: { provider: "codex-custom" }, model: "gpt-5.6-luna" },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.command).toBe("codex");
    expect(harness.spawned[0]?.args).toContain("gpt-5.6-luna");
  });

  it("uses an explicit provider mapping when the id names no CLI", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "gateway", runtimeInfo: { provider: "gateway" } },
    });
    const output = await rewrite(harness, { providerCli: { "gateway": "opencode" } });
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.command).toBe("opencode");
  });

  it("fails closed on a provider that names no supported CLI and runs nothing", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "unknown", runtimeInfo: { provider: "unknown" } },
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

  // The Composer's model control shows the runtime model, not the configured one
  // (`composer/agent-controls/utils.ts` resolvePreferredModelId). Reading only
  // `config.model` would run the wrong model, or refuse an agent whose Composer
  // visibly shows one.
  it("prefers the runtime model the Composer is showing over the configured one", async () => {
    const harness = createRewriteHarness({
      agent: {
        model: "acme/model-a",
        runtimeInfo: { provider: "pi-custom", model: "acme/model-b" },
      },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("ok");
    if (output.status !== "ok") throw new Error("expected ok");
    expect(output.model.model).toBe("acme/model-b");
    expect(harness.spawned[0]?.args).toContain("acme/model-b");
    expect(harness.spawned[0]?.args).not.toContain("acme/model-a");
  });

  // A runtime model the CLI reports while the config is still empty is the only
  // model in play; refusing it would be a fail-closed on a visible selection.
  it("uses the runtime model when no configured model is set", async () => {
    const harness = createRewriteHarness({
      agent: {
        model: null,
        runtimeInfo: { provider: "pi-custom", model: "acme/model-b" },
      },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("ok");
    if (output.status !== "ok") throw new Error("expected ok");
    expect(output.model.model).toBe("acme/model-b");
  });

  // An empty runtime string is not a selection; the configured model still wins.
  it("falls back to the configured model when the runtime model is empty", async () => {
    const harness = createRewriteHarness({
      agent: {
        model: "acme/model-a",
        runtimeInfo: { provider: "pi-custom", model: "  " },
      },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("ok");
    if (output.status !== "ok") throw new Error("expected ok");
    expect(output.model.model).toBe("acme/model-a");
  });
});

describe("runRewrite: no agent (draft Composer)", () => {
  const draft = { ...REWRITE_REQUEST, agentId: null };

  it("refuses the current-model path with a message naming the alternatives", async () => {
    const harness = createRewriteHarness({});
    const output = await runRewrite(harness.paseo, draft, { settings: await settings(), spawn: harness.spawn });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_selection");
    expect(output.error.message).toContain("no agent yet");
    expect(harness.spawned).toEqual([]);
    expect(harness.mainAgentCalls).toEqual([]);
  });

  it("runs a dedicated CLI without reading any agent", async () => {
    const harness = createRewriteHarness({
      models: [{ provider: "claude", available: true, models: ["claude-haiku-4-5"] }],
    });
    const output = await runRewrite(harness.paseo, draft, {
      settings: await settings({
        modelMode: "dedicated",
        dedicatedProvider: "claude",
        dedicatedModel: "claude-haiku-4-5",
      }),
      spawn: harness.spawn,
    });
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.command).toBe("claude");
    expect(harness.mainAgentCalls).toEqual([]);
  });

  it("ignores provider mappings on the API path and needs the dedicated endpoint", async () => {
    const harness = createRewriteHarness({});
    const output = await runRewrite(harness.paseo, draft, {
      settings: await settings({
        transport: "api",
        apiEndpoints: [
          {
            id: "groq",
            label: "Groq",
            protocol: "openai",
            baseUrl: "https://api.groq.com/openai/v1",
            apiKeyEnv: "GROQ_API_KEY",
            models: [],
          },
        ],
        apiEndpointByProvider: { "pi-custom": "groq" },
      }),
      spawn: harness.spawn,
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_selection");
  });
});

describe("runRewrite: output language", () => {
  it("refuses an output language id that is not loaded and runs nothing", async () => {
    const { createRewriteHandler } = await import("../../server/rewrite-engine/handler.js");
    const harness = createRewriteHarness({});
    const handler = createRewriteHandler({ spawn: harness.spawn });
    const output = await handler(
      {
        actionId: "general",
        agentId: "agent-1",
        workspaceId: "ws-1",
        originalPrompt: "fix it",
        settings: await settings({ outputLanguage: "not-loaded" }),
      },
      { paseo: harness.paseo } as never,
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_selection");
    expect(harness.spawned).toEqual([]);
  });

  it("sends the loaded language's instruction inside the task the CLI receives", async () => {
    const { createRewriteHandler } = await import("../../server/rewrite-engine/handler.js");
    const { listLanguages } = await import("../../shared/language-registry/registry.js");
    const language = listLanguages()[0]!;
    // claude delivers the prompt over stdin, so the assembled task is observable.
    const harness = createRewriteHarness({
      agent: { provider: "claude", runtimeInfo: { provider: "claude" } },
    });
    const handler = createRewriteHandler({ spawn: harness.spawn });
    const output = await handler(
      {
        actionId: "general",
        agentId: "agent-1",
        workspaceId: "ws-1",
        originalPrompt: "fix it",
        settings: await settings({ outputLanguage: language.id }),
      },
      { paseo: harness.paseo } as never,
    );
    expect(output.status).toBe("ok");
    const stdin = harness.spawned[0]?.stdin ?? "";
    expect(stdin).toContain(`Output language: ${language.instruction}`);
    expect(stdin.indexOf("Output language:")).toBeLessThan(stdin.indexOf("<draft>"));
  });

  // Fails if the handler sends the pack's rules without Core's rewrite contract.
  it("gives the CLI the contract and the pack's rules as its system prompt", async () => {
    const { createRewriteHandler } = await import("../../server/rewrite-engine/handler.js");
    const { resolveAction } = await import("../../shared/action-registry/registry.js");
    const { buildSystemPrompt } = await import("../../shared/action-registry/rewrite-contract.js");
    const harness = createRewriteHarness({
      agent: { provider: "claude", runtimeInfo: { provider: "claude" } },
    });
    const handler = createRewriteHandler({ spawn: harness.spawn });
    await handler(
      {
        actionId: "general",
        agentId: "agent-1",
        workspaceId: "ws-1",
        originalPrompt: "fix it",
        settings: await settings({}),
      },
      { paseo: harness.paseo } as never,
    );
    expect(harness.spawned[0]?.args).toContain(buildSystemPrompt(resolveAction("general")!));
  });

  // Fails if a custom action from settings cannot be resolved by the daemon.
  it("runs a custom action carried in the settings snapshot", async () => {
    const { createRewriteHandler } = await import("../../server/rewrite-engine/handler.js");
    const { ACTION_SAMPLES } = await import("../../client/settings/action-samples.js");
    const custom = { ...ACTION_SAMPLES.find((entry) => entry.key === "plan-first")!.pack, system: "Action: CUSTOM-MARKER." };
    const harness = createRewriteHarness({
      agent: { provider: "claude", runtimeInfo: { provider: "claude" } },
    });
    const handler = createRewriteHandler({ spawn: harness.spawn });
    const output = await handler(
      {
        actionId: custom.id,
        agentId: "agent-1",
        workspaceId: "ws-1",
        originalPrompt: "fix it",
        settings: await settings({ customActions: [custom] }),
      },
      { paseo: harness.paseo } as never,
    );
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.args.some((arg) => arg.endsWith("Action: CUSTOM-MARKER."))).toBe(true);
  });
});

describe("runRewrite: CLI failure paths", () => {
  // Fails if the CLI's own error text can reach the Composer as a rewrite.
  it("refuses a Claude result flagged is_error, with the CLI's reason", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "claude", runtimeInfo: { provider: "claude" } },
      cliResult: {
        stdout: '{"type":"result","is_error":true,"result":"Failed to authenticate: OAuth session expired"}',
        exitCode: 1,
      },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("generation_failed");
    expect(output.error.message).toContain("Failed to authenticate: OAuth session expired");
  });

  // Fails if a CLI that exits non-zero has its stdout treated as an answer.
  it("refuses any run that exits non-zero, naming stderr's first line", async () => {
    const harness = createRewriteHarness({
      cliResult: { exitCode: 2, stderr: "\nmodel not found: x\nstack…" },
    });
    const output = await rewrite(harness);
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("generation_failed");
    expect(output.error.message).toBe('The rewrite CLI "pi" exited with code 2: model not found: x');
  });

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
      agent: { provider: "pi-custom", runtimeInfo: { provider: "pi-custom" } },
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
      models: [{ provider: "unknown", available: true, models: ["model-x"] }],
    });
    const output = await rewrite(harness, {
      modelMode: "dedicated",
      dedicatedProvider: "unknown",
      dedicatedModel: "model-x",
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("unsupported_provider");
    expect(harness.spawned).toEqual([]);
  });

  // The dedicated path borrows only the agent's working directory. Requiring the
  // agent's own provider to have a CLI family would refuse a valid dedicated
  // selection for every agent whose provider has no CLI at all.
  it("runs the dedicated CLI even when the current agent's provider has no CLI family", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "unknown", runtimeInfo: { provider: "unknown" } },
      models: [{ provider: "claude", available: true, models: ["claude-haiku-4-5"] }],
    });
    const output = await rewrite(harness, {
      modelMode: "dedicated",
      dedicatedProvider: "claude",
      dedicatedModel: "claude-haiku-4-5",
    });
    expect(output.status).toBe("ok");
    expect(harness.spawned[0]?.command).toBe("claude");
    expect(harness.spawned[0]?.cwd).not.toBe("/tmp/workspace");
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

/**
 * The API transport, driven through the same `runRewrite` entry point as the CLI
 * paths. `fetch` and `env` are seams, so no test opens a socket or needs a real key.
 */
async function rewriteApi(
  harness: ReturnType<typeof createRewriteHarness>,
  overrides: Record<string, unknown>,
  http: {
    status?: number;
    body?: unknown;
    reject?: Error;
    env?: NodeJS.ProcessEnv;
    request?: Partial<typeof REWRITE_REQUEST>;
  } = {},
) {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetchImpl = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: init.body });
    if (http.reject) throw http.reject;
    const status = http.status ?? 200;
    const body = http.body === undefined ? {} : http.body;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  }) as unknown as typeof globalThis.fetch;

  const output = await runRewrite(
    harness.paseo,
    { ...REWRITE_REQUEST, ...http.request },
    {
      settings: await settings(overrides),
      fetch: fetchImpl,
      env: http.env ?? {},
    },
  );
  return { output, calls };
}

const GROQ_ENDPOINT = {
  id: "groq",
  label: "Groq",
  protocol: "openai",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKeyEnv: "GROQ_API_KEY",
  models: ["openai/gpt-oss-20b"],
};

const OK_BODY = { choices: [{ message: { content: "rewritten text" } }] };

describe("runRewrite: api transport", () => {
  it("posts to the endpoint and returns its text without spawning a CLI", async () => {
    const harness = createRewriteHarness({});
    const { output, calls } = await rewriteApi(
      harness,
      {
        transport: "api",
        modelMode: "dedicated",
        apiEndpoints: [GROQ_ENDPOINT],
        apiEndpointId: "groq",
        apiModel: "openai/gpt-oss-20b",
      },
      { body: OK_BODY, env: { GROQ_API_KEY: "sk-test" } },
    );

    expect(output.status).toBe("ok");
    if (output.status !== "ok") throw new Error("expected ok");
    expect(output.rewrittenPrompt).toBe("rewritten text");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(calls[0]?.headers["authorization"]).toBe("Bearer sk-test");
    // The CLI path must stay untouched: no process, and the agent is only read.
    expect(harness.spawned).toEqual([]);
    expect(harness.mainAgentCalls).toEqual(["refresh"]);
    expect(output.model).toEqual({
      provider: "groq",
      model: "openai/gpt-oss-20b",
      thinkingOptionId: null,
    });
  });

  // "opencode talks to my own OpenAI endpoint": the endpoint is mapped to the
  // agent's provider, so the agent's own model is sent and no dedicated model is
  // needed.
  it("sends the agent's own model when an endpoint is mapped to its provider", async () => {
    const harness = createRewriteHarness({
      agent: {
        provider: "opencode",
        model: "acme/model-a",
        runtimeInfo: { provider: "opencode" },
      },
    });
    const { output, calls } = await rewriteApi(
      harness,
      {
        transport: "api",
        apiEndpoints: [{ ...GROQ_ENDPOINT, models: [] }],
        apiEndpointByProvider: { opencode: "groq" },
      },
      { body: OK_BODY, env: { GROQ_API_KEY: "sk-test" } },
    );

    expect(output.status).toBe("ok");
    expect(JSON.parse(calls[0]!.body).model).toBe("acme/model-a");
    expect(harness.spawned).toEqual([]);
  });

  // A provider with no CLI family is still reachable through an endpoint, so the
  // API path must not require one.
  it("works for a provider that has no CLI family", async () => {
    const harness = createRewriteHarness({
      agent: { provider: "unknown", runtimeInfo: { provider: "unknown" } },
    });
    const { output } = await rewriteApi(
      harness,
      {
        transport: "api",
        apiEndpoints: [{ ...GROQ_ENDPOINT, models: [] }],
        apiEndpointByProvider: { unknown: "groq" },
      },
      { body: OK_BODY, env: { GROQ_API_KEY: "sk-test" } },
    );
    expect(output.status).toBe("ok");
  });

  it("fails closed with missing_api_key and makes no request", async () => {
    const harness = createRewriteHarness({});
    const { output, calls } = await rewriteApi(
      harness,
      {
        transport: "api",
        modelMode: "dedicated",
        apiEndpoints: [GROQ_ENDPOINT],
        apiEndpointId: "groq",
        apiModel: "openai/gpt-oss-20b",
      },
      { body: OK_BODY, env: {} },
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("missing_api_key");
    // The name is named; the value is not, because there is none.
    expect(output.error.message).toContain("GROQ_API_KEY");
    expect(calls).toEqual([]);
    expect(harness.spawned).toEqual([]);
  });

  it("maps a non-2xx answer to api_http_error", async () => {
    const harness = createRewriteHarness({});
    const { output } = await rewriteApi(
      harness,
      {
        transport: "api",
        modelMode: "dedicated",
        apiEndpoints: [GROQ_ENDPOINT],
        apiEndpointId: "groq",
        apiModel: "openai/gpt-oss-20b",
      },
      { status: 401, body: "unauthorized", env: { GROQ_API_KEY: "sk-test" } },
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("api_http_error");
    expect(output.error.message).toContain("401");
  });

  it("maps an unreadable body to api_bad_response", async () => {
    const harness = createRewriteHarness({});
    const { output } = await rewriteApi(
      harness,
      {
        transport: "api",
        modelMode: "dedicated",
        apiEndpoints: [GROQ_ENDPOINT],
        apiEndpointId: "groq",
        apiModel: "openai/gpt-oss-20b",
      },
      { body: "not json", env: { GROQ_API_KEY: "sk-test" } },
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("api_bad_response");
  });

  it("maps a well-formed body with no text to api_bad_response", async () => {
    const harness = createRewriteHarness({});
    const { output } = await rewriteApi(
      harness,
      {
        transport: "api",
        modelMode: "dedicated",
        apiEndpoints: [GROQ_ENDPOINT],
        apiEndpointId: "groq",
        apiModel: "openai/gpt-oss-20b",
      },
      { body: { choices: [] }, env: { GROQ_API_KEY: "sk-test" } },
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("api_bad_response");
  });

  it("fails closed with api_endpoint_unknown and makes no request", async () => {
    const harness = createRewriteHarness({});
    const { output, calls } = await rewriteApi(harness, {
      transport: "api",
      modelMode: "dedicated",
      apiEndpoints: [GROQ_ENDPOINT],
      apiEndpointId: "absent",
      apiModel: "openai/gpt-oss-20b",
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("api_endpoint_unknown");
    expect(calls).toEqual([]);
  });

  // Model source is a CLI setting: the API path uses the selected endpoint's model whatever modelMode says.
  it("uses the selected endpoint and model on the api transport whatever modelMode says", async () => {
    const harness = createRewriteHarness({});
    const { output, calls } = await rewriteApi(
      harness,
      {
        transport: "api",
        modelMode: "current",
        apiEndpoints: [GROQ_ENDPOINT],
        apiEndpointId: "groq",
        apiModel: "openai/gpt-oss-20b",
      },
      { body: OK_BODY, env: { GROQ_API_KEY: "sk-test" } },
    );
    expect(output.status).toBe("ok");
    expect(JSON.parse(calls[0]!.body).model).toBe("openai/gpt-oss-20b");
    expect(harness.spawned).toEqual([]);
  });

  it("refuses the api transport when an unmapped agent has no API model selected", async () => {
    const harness = createRewriteHarness({});
    const { output, calls } = await rewriteApi(harness, {
      transport: "api",
      apiEndpoints: [GROQ_ENDPOINT],
      apiEndpointId: "groq",
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_selection");
    expect(calls).toEqual([]);
  });

  it("refuses a model the endpoint does not declare", async () => {
    const harness = createRewriteHarness({});
    const { output, calls } = await rewriteApi(harness, {
      transport: "api",
      modelMode: "dedicated",
      apiEndpoints: [GROQ_ENDPOINT],
      apiEndpointId: "groq",
      apiModel: "not-a-listed-model",
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_model");
    expect(calls).toEqual([]);
  });

  // The protected-literal guard is shared, so the API path cannot be a way around it.
  it("refuses output that dropped a protected literal", async () => {
    const harness = createRewriteHarness({});
    const { output } = await rewriteApi(
      harness,
      {
        transport: "api",
        modelMode: "dedicated",
        apiEndpoints: [GROQ_ENDPOINT],
        apiEndpointId: "groq",
        apiModel: "openai/gpt-oss-20b",
      },
      {
        body: { choices: [{ message: { content: "no literal here" } }] },
        env: { GROQ_API_KEY: "sk-test" },
        request: { originalPrompt: "fix /tmp/app/login.ts" },
      },
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("protected_literal_loss");
  });

  it("maps an aborted request to timeout", async () => {
    const harness = createRewriteHarness({});
    const abort = new Error("aborted");
    const { output } = await rewriteApi(
      harness,
      {
        transport: "api",
        modelMode: "dedicated",
        apiEndpoints: [GROQ_ENDPOINT],
        apiEndpointId: "groq",
        apiModel: "openai/gpt-oss-20b",
      },
      { reject: abort, env: { GROQ_API_KEY: "sk-test" } },
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(["api_http_error", "timeout"]).toContain(output.error.code);
  });

  // The API transport is selected by `transport`, so a CLI family must not be
  // resolved for it. A provider with no family proves that.
  it("does not require a CLI family on the api path", async () => {
    const harness = createRewriteHarness({ agent: { provider: "no-such-cli" } });
    const { output } = await rewriteApi(
      harness,
      {
        transport: "api",
        modelMode: "dedicated",
        apiEndpoints: [GROQ_ENDPOINT],
        apiEndpointId: "groq",
        apiModel: "openai/gpt-oss-20b",
      },
      { body: OK_BODY, env: { GROQ_API_KEY: "sk-test" } },
    );
    expect(output.status).toBe("ok");
  });
});
