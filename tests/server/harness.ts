import type { PaseoApi } from "@getpaseo/client";
import { promptKitSettingsSchema, type PromptKitSettings } from "../../shared/settings.js";

export interface FakeAgent {
  id: string;
  provider: string;
  model: string | null;
  thinkingOptionId: string | null;
  effectiveThinkingOptionId: string | null;
  cwd: string;
  runtimeInfo: { provider: string } | undefined;
}

export interface CreatedAgent {
  options: {
    config: {
      provider: string;
      thinkingOptionId?: string;
      systemPrompt?: string;
    };
    prompt?: string;
    title?: string;
    labels?: Record<string, string>;
    autoArchive?: boolean;
  };
  finish: FinishResult;
}

export interface FinishResult {
  status: "idle" | "error" | "permission" | "timeout";
  lastMessage: string | null;
  error: string | null;
}

export interface CatalogEntry {
  provider: string;
  available: boolean;
  models: string[];
  thinking?: string[];
}

export interface Harness {
  paseo: PaseoApi;
  created: CreatedAgent[];
  archived: string[];
  /** Calls that would touch the primary conversation; must stay at ["refresh"]. */
  mainAgentCalls: string[];
}

export interface HarnessInput {
  agent?: Partial<FakeAgent>;
  finish?: FinishResult;
  models?: CatalogEntry[];
  /** Simulates the provider RPC failing while the daemon is up. */
  catalogError?: Error;
  /** Simulates archive() rejecting after the turn already produced a result. */
  archiveError?: Error;
  tempAgentId?: string;
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
  const created: CreatedAgent[] = [];
  const archived: string[] = [];
  const mainAgentCalls: string[] = [];
  const finish: FinishResult =
    input.finish ?? { status: "idle", lastMessage: "rewritten text", error: null };
  const tempAgentId = input.tempAgentId ?? "temp-agent-1";

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
    workspaces: {
      ref: () => ({
        agents: {
          create: async (options: CreatedAgent["options"]) => {
            created.push({ options, finish });
            return {
              id: tempAgentId,
              waitForFinish: async () => finish,
              archive: async () => {
                if (input.archiveError) throw input.archiveError;
                archived.push(tempAgentId);
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
