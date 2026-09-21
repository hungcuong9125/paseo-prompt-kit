import type { PaseoApi } from "@getpaseo/client";
import { promptKitSettingsSchema, type PromptKitSettings } from "../../shared/settings.js";
import type { CliRunInput, CliRunResult, CliSpawner } from "../../server/cli/process.js";

export interface FakeAgent {
  id: string;
  provider: string;
  model: string | null;
  thinkingOptionId: string | null;
  effectiveThinkingOptionId: string | null;
  cwd: string;
  runtimeInfo: { provider: string; model?: string | null } | undefined;
}

export interface CatalogEntry {
  provider: string;
  available: boolean;
  models: string[];
  thinking?: string[];
}

export interface Harness {
  paseo: PaseoApi;
  /** The CLI process spawner, wired into `runRewrite` by the caller. */
  spawn: CliSpawner;
  /** Every CLI process the rewrite started, in order. */
  spawned: CliRunInput[];
  /** Working directories the runner was given; each is deleted after the run. */
  scratchDirs: string[];
  /** Calls that would touch the primary conversation; must stay at ["refresh"]. */
  mainAgentCalls: string[];
}

export interface HarnessInput {
  agent?: Partial<FakeAgent>;
  models?: CatalogEntry[];
  /** Simulates the provider RPC failing while the daemon is up. */
  catalogError?: Error;
  /** Overrides the captured CLI result. */
  cliResult?: Partial<CliRunResult>;
}

/** A CLI result shaped like a real `--mode json` run that answered successfully. */
export function cliStdout(text: string): string {
  return `${JSON.stringify({
    type: "turn_end",
    message: { role: "assistant", content: [{ type: "text", text }] },
  })}\n`;
}

/**
 * The output shape each CLI family actually emits, so a test that swaps the
 * process spawner still exercises the family's real parser, not a stand-in.
 */
export function stdoutFor(command: string, text: string): string {
  switch (command) {
    case "claude":
      return JSON.stringify({ type: "result", subtype: "success", result: text });
    case "codex":
      return `${JSON.stringify({
        type: "item.completed",
        item: { id: "item_0", type: "agent_message", text },
      })}\n`;
    case "opencode":
      return `${JSON.stringify({ type: "text", part: { type: "text", text } })}\n`;
    default:
      return cliStdout(text);
  }
}

export function createRewriteHarness(input: HarnessInput = {}): Harness {
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
  const spawned: CliRunInput[] = [];
  const scratchDirs: string[] = [];
  const mainAgentCalls: string[] = [];

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
      snapshot: async () => {
        if (input.catalogError) throw input.catalogError;
        return {
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
        };
      },
      listAvailable: async () => {
        if (input.catalogError) throw input.catalogError;
        return {
          providers: (input.models ?? []).map((entry) => ({
            provider: entry.provider,
            available: entry.available,
          })),
        };
      },
    },
  } as unknown as PaseoApi;

  const spawn: CliSpawner = async (run) => {
    spawned.push(run);
    scratchDirs.push(run.cwd);
    return {
      stdout: stdoutFor(run.command, "rewritten text"),
      stderr: "",
      exitCode: 0,
      timedOut: false,
      truncated: false,
      ...input.cliResult,
    };
  };

  return { paseo, spawn, spawned, scratchDirs, mainAgentCalls };
}

export async function settings(overrides: Record<string, unknown> = {}): Promise<PromptKitSettings> {
  return promptKitSettingsSchema.parseAsync(overrides);
}

export const REWRITE_REQUEST = {
  agentId: "agent-1",
  workspaceId: "wks_1",
  systemPrompt: "SYSTEM",
  originalPrompt: "fix the bug",
  taskPrompt: "<user_prompt>\nfix the bug\n</user_prompt>",
};
