import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { promptKitSettingsSchema, type PromptKitSettings } from "../../shared/settings.js";

const DAEMON_URL = process.env.PASEO_DAEMON_URL ?? "ws://127.0.0.1:6767/ws";
const PLUGIN_ID = "prompt-kit";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REWRITE_LABELS = { "prompt-kit": "rewrite" };

interface TempAgentRow {
  id: string;
  archivedAt: string | null;
}

let client: DaemonClient | null = null;
let unavailableReason: string | null = null;
let primaryAgentId: string | null = null;
let primaryWorkspaceId: string | null = null;
let settings: PromptKitSettings | null = null;

beforeAll(async () => {
  const agentId = process.env.PASEO_AGENT_ID;
  if (!agentId) {
    unavailableReason = "PASEO_AGENT_ID is not set; there is no primary agent to rewrite from";
    return;
  }
  primaryAgentId = agentId;
  try {
    client = new DaemonClient({
      url: DAEMON_URL,
      clientId: `prompt-kit-spike-${process.pid}`,
      clientType: "cli",
      appVersion: "0.8.0",
      connectTimeoutMs: 5_000,
    });
    await client.connect();
    const refreshed = await client.fetchAgent(agentId);
    if (!refreshed) {
      unavailableReason = `primary agent is not available on ${DAEMON_URL}: ${agentId}`;
      return;
    }
    primaryWorkspaceId = refreshed.agent.workspaceId ?? null;
    if (!primaryWorkspaceId) {
      unavailableReason = `primary agent has no workspaceId: ${agentId}`;
      return;
    }
    const stored = await client.invokePluginRpc(PLUGIN_ID, "settings.prompt-kit.read", {});
    const parsed = await promptKitSettingsSchema.parseAsync(
      (stored as { values?: unknown }).values ?? {},
    );
    settings = { ...parsed, timeoutMs: 120_000 };
    await installPlugin(client);
  } catch (error) {
    unavailableReason = `${DAEMON_URL} unusable: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
});

afterAll(async () => {
  await client?.close().catch(() => undefined);
});

async function installPlugin(daemon: DaemonClient): Promise<void> {
  try {
    await daemon.installDirectoryPlugin(REPO_ROOT);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("already configured")) throw error;
    await daemon.reloadPlugin(PLUGIN_ID);
  }
}

async function rewriteAgents(daemon: DaemonClient): Promise<TempAgentRow[]> {
  const listed = await daemon.fetchAgents({
    filter: { labels: REWRITE_LABELS, includeArchived: true },
    page: { limit: 100 },
  });
  return listed.entries.map((entry) => ({
    id: entry.agent.id,
    archivedAt: entry.agent.archivedAt ?? null,
  }));
}

describe("live daemon: temporary-agent rewrite round trip", () => {
  it("returns rewritten text and leaves the temporary agent archived", async (context) => {
    if (unavailableReason || !client || !primaryAgentId || !primaryWorkspaceId || !settings) {
      context.skip(unavailableReason ?? "daemon unavailable");
      return;
    }
    const marker = `PROMPTKIT_SPIKE_${Date.now()}`;
    const originalPrompt = `${marker} kiểm tra phần login xem lỗi ở đâu rồi sửa giúp tôi`;

    const beforeIds = new Set((await rewriteAgents(client)).map((agent) => agent.id));

    const output = await client.invokePluginRpc(PLUGIN_ID, "prompt-kit.rewrite", {
      actionId: "coding",
      agentId: primaryAgentId,
      workspaceId: primaryWorkspaceId,
      originalPrompt,
      settings,
    });

    const result = output as {
      status: string;
      rewrittenPrompt?: string;
      durationMs?: number;
      error?: { code: string; message: string };
    };
    expect(result.status, JSON.stringify(result.error)).toBe("ok");
    expect(result.rewrittenPrompt?.trim().length ?? 0).toBeGreaterThan(0);
    expect(result.durationMs ?? -1).toBeGreaterThanOrEqual(0);

    const created = (await rewriteAgents(client)).filter((agent) => !beforeIds.has(agent.id));
    expect(created).toHaveLength(1);
    expect(created[0]?.archivedAt).toBeTruthy();
    console.log(
      `[spike-b] rewritten=${JSON.stringify(result.rewrittenPrompt)} ` +
        `tempAgent=${created[0]?.id} archivedAt=${created[0]?.archivedAt} ` +
        `durationMs=${result.durationMs}`,
    );
  });

  it("never writes the rewrite task into the primary conversation", async (context) => {
    if (unavailableReason || !client || !primaryAgentId || !primaryWorkspaceId || !settings) {
      context.skip(unavailableReason ?? "daemon unavailable");
      return;
    }
    const marker = `PROMPTKIT_PRIMARY_${Date.now()}`;
    const output = await client.invokePluginRpc(PLUGIN_ID, "prompt-kit.rewrite", {
      actionId: "coding",
      agentId: primaryAgentId,
      workspaceId: primaryWorkspaceId,
      originalPrompt: `${marker} sửa lỗi đăng nhập`,
      settings,
    });
    expect((output as { status: string }).status, JSON.stringify(output)).toBe("ok");

    const timeline = await client.fetchAgentTimeline(primaryAgentId, { limit: 50 });
    expect(JSON.stringify(timeline)).not.toContain(marker);
  });
});
