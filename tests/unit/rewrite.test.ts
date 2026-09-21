import { describe, expect, it } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import { promptKitSettingsSchema, type PromptKitSettings } from "../../shared/settings.js";
import { runRewrite } from "../../server/rewrite.js";

interface FakeAgent {
  id: string;
  provider: string;
  model: string | null;
  thinkingOptionId: string | null;
  effectiveThinkingOptionId: string | null;
  cwd: string;
  runtimeInfo: { provider: string } | undefined;
}

interface CreatedAgent {
  options: {
    config: { provider: string; thinkingOptionId?: string; systemPrompt?: string };
    prompt?: string;
    title?: string;
    cwd?: string;
    labels?: Record<string, string>;
    autoArchive?: boolean;
  };
  finish: { status: "idle" | "error" | "permission" | "timeout"; lastMessage: string | null; error: string | null };
}

interface Harness {
  paseo: PaseoApi;
  created: CreatedAgent[];
  archived: string[];
  mainAgentCalls: string[];
}

function createHarness(input: {
  agent?: Partial<FakeAgent>;
  finish?: CreatedAgent["finish"];
  models?: { provider: string; available: boolean; models: string[]; thinking?: string[] }[];
}): Harness {
  const agent: FakeAgent = {
    id: "agent-1",
    provider: "pi-peer",
    model: "workbuddy/deepseek-v4.1-flash",
    thinkingOptionId: "high",
    effectiveThinkingOptionId: "high",
    cwd: "/tmp/workspace",
    runtimeInfo: { provider: "pi-peer" },
    ...input.agent,
  };
  const created: CreatedAgent[] = [];
  const archived: string[] = [];
  const mainAgentCalls: string[] = [];
  const finish =
    input.finish ?? { status: "idle" as const, lastMessage: "rewritten text", error: null };

  const paseo = {
    agents: {
      ref: (id: string) => ({
        id,
        refresh: async () => {
          mainAgentCalls.push("refresh");
          return { agent, project: null };
        },
        run: async () => {
          mainAgentCalls.push("run");
          throw new Error("The primary agent must never run a rewrite");
        },
        send: async () => {
          mainAgentCalls.push("send");
          throw new Error("The primary agent must never receive a rewrite");
        },
      }),
    },
    providers: {
      snapshot: async () => ({
        entries: (input.models ?? []).map((entry) => ({
          provider: entry.provider,
          label: entry.provider,
          status: "ready",
          enabled: true,
          models: entry.models.map((id) => ({
            provider: entry.provider,
            id,
            label: id,
            thinkingOptions: (entry.thinking ?? []).map((thinking) => ({
              id: thinking,
              label: thinking,
            })),
            defaultThinkingOptionId: entry.thinking?.[0],
          })),
        })),
      }),
      listAvailable: async () => ({
        providers: (input.models ?? []).map((entry) => ({
          provider: entry.provider,
          available: entry.available,
        })),
      }),
    },
    workspaces: {
      ref: () => ({
        agents: {
          create: async (options: CreatedAgent["options"]) => {
            created.push({ options, finish });
            return {
              id: "temp-agent-1",
              waitForFinish: async () => finish,
              archive: async () => {
                archived.push("temp-agent-1");
                return { archivedAt: new Date().toISOString() };
              },
            };
          },
        },
      }),
    },
  } as unknown as PaseoApi;

  return { paseo, created, archived, mainAgentCalls };
}

async function settings(overrides: Record<string, unknown> = {}): Promise<PromptKitSettings> {
  return promptKitSettingsSchema.parseAsync(overrides);
}

const REQUEST = {
  agentId: "agent-1",
  workspaceId: "wks_1",
  systemPrompt: "SYSTEM",
  originalPrompt: "fix the bug",
  taskPrompt: "<user_prompt>\nfix the bug\n</user_prompt>",
};

describe("runRewrite", () => {
  it("uses the current agent model, returns the text and archives the temporary agent", async () => {
    const harness = createHarness({});
    const output = await runRewrite(harness.paseo, REQUEST, {
      settings: await settings(),
    });

    expect(output.status).toBe("ok");
    if (output.status !== "ok") throw new Error("expected ok");
    expect(output.rewrittenPrompt).toBe("rewritten text");
    expect(output.model).toEqual({
      provider: "pi-peer",
      model: "workbuddy/deepseek-v4.1-flash",
      thinkingOptionId: "high",
    });
    expect(harness.created[0]?.options.config.provider).toBe(
      "pi-peer/workbuddy/deepseek-v4.1-flash",
    );
    expect(harness.created[0]?.options.config.systemPrompt).toBe("SYSTEM");
    expect(harness.created[0]?.options.autoArchive).toBeUndefined();
    expect(harness.archived).toEqual(["temp-agent-1"]);
    expect(harness.mainAgentCalls).toEqual(["refresh"]);
  });

  it("archives the temporary agent when the turn fails", async () => {
    const harness = createHarness({
      finish: { status: "error", lastMessage: null, error: "provider exploded" },
    });
    const output = await runRewrite(harness.paseo, REQUEST, { settings: await settings() });
    expect(output).toEqual({
      status: "error",
      error: { code: "generation_failed", message: "provider exploded" },
    });
    expect(harness.archived).toEqual(["temp-agent-1"]);
  });

  it("archives the temporary agent when the turn times out", async () => {
    const harness = createHarness({
      finish: { status: "timeout", lastMessage: null, error: null },
    });
    const output = await runRewrite(harness.paseo, REQUEST, { settings: await settings() });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("timeout");
    expect(harness.archived).toEqual(["temp-agent-1"]);
  });

  it("fails closed on empty output", async () => {
    const harness = createHarness({
      finish: { status: "idle", lastMessage: "   ", error: null },
    });
    const output = await runRewrite(harness.paseo, REQUEST, { settings: await settings() });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("empty_output");
    expect(harness.archived).toEqual(["temp-agent-1"]);
  });

  it("rejects a rewrite that drops a protected literal", async () => {
    const harness = createHarness({
      finish: { status: "idle", lastMessage: "Please fix the login bug.", error: null },
    });
    const output = await runRewrite(
      harness.paseo,
      {
        ...REQUEST,
        originalPrompt: "fix the bug in /tmp/app/main.ts",
        taskPrompt: "<user_prompt>\nfix the bug in /tmp/app/main.ts\n</user_prompt>",
      },
      { settings: await settings() },
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("protected_literal_loss");
    expect(output.error.message).toContain("/tmp/app/main.ts");
  });

  it("uses the dedicated model when selected and available", async () => {
    const harness = createHarness({
      models: [{ provider: "claude", available: true, models: ["claude-opus-5"], thinking: ["low"] }],
    });
    const output = await runRewrite(harness.paseo, REQUEST, {
      settings: await settings({
        modelMode: "dedicated",
        dedicatedProvider: "claude",
        dedicatedModel: "claude-opus-5",
        dedicatedThinkingOptionId: "low",
      }),
    });
    expect(output.status).toBe("ok");
    if (output.status !== "ok") throw new Error("expected ok");
    expect(output.model).toEqual({
      provider: "claude",
      model: "claude-opus-5",
      thinkingOptionId: "low",
    });
    expect(harness.created[0]?.options.config.provider).toBe("claude/claude-opus-5");
  });

  it("fails closed without creating an agent when the dedicated model is unavailable", async () => {
    const harness = createHarness({
      models: [{ provider: "claude", available: false, models: ["claude-opus-5"] }],
    });
    const output = await runRewrite(harness.paseo, REQUEST, {
      settings: await settings({
        modelMode: "dedicated",
        dedicatedProvider: "claude",
        dedicatedModel: "claude-opus-5",
      }),
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_model");
    expect(harness.created).toEqual([]);
    expect(harness.archived).toEqual([]);
  });

  it("fails closed on an incomplete dedicated selection", async () => {
    const harness = createHarness({});
    const output = await runRewrite(harness.paseo, REQUEST, {
      settings: await settings({ modelMode: "dedicated", dedicatedProvider: "claude" }),
    });
    expect(output.status).toBe("error");
    if (output.status !== "error") throw new Error("expected error");
    expect(output.error.code).toBe("invalid_selection");
    expect(harness.created).toEqual([]);
  });
});
