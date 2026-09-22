import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ApiEndpoint } from "../../shared/api-protocol.js";

/**
 * Live API transport probe: the third path, through the real daemon, against a
 * real endpoint.
 *
 * Opt-in for the same two reasons as the live daemon probe: it spends real model
 * calls, and it needs a key that CI does not have. The key is read from the
 * environment and written to a throwaway secrets directory, so the probe proves
 * the `secrets.json` path without touching the user's real file.
 *
 *   PASEO_LIVE=1 PASEO_AGENT_ID=<uuid> GEMINI_API_KEY=... npx vitest run tests/integration
 *
 * Every model here is cheap (HUMAN_DIRECTIVE, DLF-013): the row proves a protocol
 * is accepted, which a small model proves as well as a frontier one.
 */

const DAEMON_URL = process.env.PASEO_DAEMON_URL ?? "ws://127.0.0.1:6767/ws";
const PLUGIN_ID = "prompt-kit";

/**
 * One endpoint per protocol, each gated on its own key being present. A protocol
 * whose key is absent is skipped rather than substituted, so a missing key never
 * turns into a false failure or a call to a provider the probe was not told about.
 */
const ENDPOINTS: readonly ApiEndpoint[] = [
  {
    id: "openai",
    label: "OpenAI-compatible",
    protocol: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    keySource: "env",
    apiKeyEnv: "GROQ_API_KEY",
    models: ["openai/gpt-oss-20b"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    keySource: "env",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    models: ["claude-haiku-4-5"],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    keySource: "env",
    apiKeyEnv: "GEMINI_API_KEY",
    // A stable model: a preview model is intermittently 503 under load, which
    // would make the row flaky for a reason that has nothing to do with PromptKit.
    models: ["gemini-2.5-flash"],
  },
];

const ORIGINAL = "sửa lỗi đăng nhập trong /Volumes/DataSSD/app/login.ts, chạy npm run gate";
const LITERALS = ["/Volumes/DataSSD/app/login.ts", "npm run gate"];

interface RewriteResult {
  status: string;
  rewrittenPrompt?: string;
  model?: { provider: string; model: string | null };
  durationMs?: number;
  error?: { code: string; message: string };
}

let client: DaemonClient | null = null;
let unavailableReason: string | null = null;
let agentId: string | null = null;
let workspaceId: string | null = null;
let secretsDir: string | null = null;
let keys: Readonly<Record<string, string>> = {};

beforeAll(async () => {
  if (process.env.PASEO_LIVE !== "1") {
    unavailableReason = "PASEO_LIVE is not 1; the live rows are opt-in";
    return;
  }
  const id = process.env.PASEO_AGENT_ID;
  if (!id) {
    unavailableReason = "PASEO_AGENT_ID is not set";
    return;
  }
  agentId = id;

  const present: Record<string, string> = {};
  for (const endpoint of ENDPOINTS) {
    const value = process.env[endpoint.apiKeyEnv];
    if (typeof value === "string" && value.trim() !== "") present[endpoint.apiKeyEnv] = value.trim();
  }
  keys = present;
  if (Object.keys(present).length === 0) {
    unavailableReason = "no API key is set for any probe endpoint";
    return;
  }

  // A throwaway secrets file, so the probe exercises the real `secrets.json` read
  // path without writing to the user's own file.
  secretsDir = await mkdtemp(path.join(tmpdir(), "prompt-kit-live-api-"));
  await writeFile(
    path.join(secretsDir, "secrets.json"),
    JSON.stringify({ version: 1, apiKeys: present }),
    { mode: 0o600 },
  );

  try {
    client = new DaemonClient({
      url: DAEMON_URL,
      clientId: `prompt-kit-live-api-${process.pid}`,
      clientType: "cli",
      appVersion: "0.8.0",
      connectTimeoutMs: 5_000,
    });
    await client.connect();
    const refreshed = await client.fetchAgent(id);
    if (!refreshed) {
      unavailableReason = `primary agent is not available on ${DAEMON_URL}: ${id}`;
      return;
    }
    workspaceId = refreshed.agent.workspaceId ?? null;
    if (!workspaceId) {
      unavailableReason = `primary agent has no workspaceId: ${id}`;
      return;
    }
    try {
      await client.installDirectoryPlugin(path.resolve(process.cwd()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("already configured")) throw error;
      await client.reloadPlugin(PLUGIN_ID);
    }
  } catch (error) {
    unavailableReason = `${DAEMON_URL} unusable: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
});

afterAll(async () => {
  await client?.close().catch(() => undefined);
  if (secretsDir !== null) await rm(secretsDir, { recursive: true, force: true });
});

function requireLive(context: { skip: (reason: string) => void }): boolean {
  if (unavailableReason || !client || !agentId || !workspaceId || secretsDir === null) {
    context.skip(unavailableReason ?? "daemon unavailable");
    return false;
  }
  return true;
}

async function rewriteWith(settings: Record<string, unknown>): Promise<RewriteResult> {
  const output = await client!.invokePluginRpc(PLUGIN_ID, "prompt-kit.rewrite", {
    actionId: "coding",
    agentId,
    workspaceId,
    originalPrompt: ORIGINAL,
    settings: {
      modelMode: "dedicated",
      transport: "api",
      dedicatedProvider: null,
      dedicatedModel: null,
      dedicatedThinkingOptionId: null,
      providerCli: {},
      apiEndpoints: [],
      apiEndpointId: null,
      apiModel: null,
      apiEndpointByProvider: {},
      secretsDir,
      timeoutMs: 60_000,
      actionEnabled: {},
      ...settings,
    },
  });
  return output as RewriteResult;
}

describe("live daemon: api transport", () => {
  // One row per protocol. Fails if a protocol module builds a request a real
  // server rejects, or if the answer cannot be read back.
  for (const endpoint of ENDPOINTS) {
    it(`rewrites through the ${endpoint.protocol} protocol and keeps protected literals`, async (context) => {
      if (!requireLive(context)) return;
      if (keys[endpoint.apiKeyEnv] === undefined) {
        context.skip(`${endpoint.apiKeyEnv} is not set`);
        return;
      }
      const model = endpoint.models[0]!;
      const result = await rewriteWith({
        apiEndpoints: [endpoint],
        apiEndpointId: endpoint.id,
        apiModel: model,
      });

      expect(result.status, JSON.stringify(result.error)).toBe("ok");
      const text = result.rewrittenPrompt ?? "";
      expect(text.trim().length).toBeGreaterThan(0);
      for (const literal of LITERALS) {
        expect(text, literal).toContain(literal);
      }
      expect(result.model?.provider).toBe(endpoint.id);
      console.log(
        `[live-api-${endpoint.protocol}] model=${model} durationMs=${result.durationMs}`,
      );
    }, 120_000);
  }

  // The key reaches the server through `secrets.json`, not through the settings
  // document: the document carries the name only.
  it("reads the key from secrets.json and never from the settings document", async (context) => {
    if (!requireLive(context)) return;
    const endpoint = ENDPOINTS.find((candidate) => keys[candidate.apiKeyEnv] !== undefined);
    if (!endpoint) {
      context.skip("no API key is set for any probe endpoint");
      return;
    }
    const stored = (await client!.invokePluginRpc(PLUGIN_ID, "settings.prompt-kit.read", {})) as {
      values?: unknown;
    };
    // Whatever the host holds, it must not contain a key value.
    const serialized = JSON.stringify(stored.values ?? {});
    for (const value of Object.values(keys)) {
      expect(serialized).not.toContain(value);
    }
  });

  // Fails if a missing key is not reported, or if the message leaks a value.
  it("fails closed with missing_api_key, naming the variable and not a value", async (context) => {
    if (!requireLive(context)) return;
    const endpoint = ENDPOINTS[0]!;
    const result = await rewriteWith({
      apiEndpoints: [{ ...endpoint, apiKeyEnv: "PROMPTKIT_ABSENT_KEY_9f31" }],
      apiEndpointId: endpoint.id,
      apiModel: endpoint.models[0]!,
    });
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("missing_api_key");
    expect(result.rewrittenPrompt).toBeUndefined();
    expect(result.error?.message).toContain("PROMPTKIT_ABSENT_KEY_9f31");
    for (const value of Object.values(keys)) {
      expect(result.error?.message).not.toContain(value);
    }
    console.log(`[live-api-no-key] code=${result.error?.code} message=${result.error?.message}`);
  });

  // Fails if an endpoint id that no endpoint defines is guessed at instead of refused.
  it("fails closed with api_endpoint_unknown and makes no request", async (context) => {
    if (!requireLive(context)) return;
    const result = await rewriteWith({
      apiEndpoints: [],
      apiEndpointId: "no-such-endpoint",
      apiModel: "any-model",
    });
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("api_endpoint_unknown");
    console.log(`[live-api-unknown] code=${result.error?.code}`);
  });

  // The API transport must not require a CLI family: the point of the path is that
  // no CLI is involved.
  it("runs with no CLI spawned and leaves the agent set unchanged", async (context) => {
    if (!requireLive(context)) return;
    const endpoint = ENDPOINTS.find((candidate) => keys[candidate.apiKeyEnv] !== undefined);
    if (!endpoint) {
      context.skip("no API key is set for any probe endpoint");
      return;
    }
    const listed = await client!.fetchAgents({ filter: {}, page: { limit: 200 } });
    const before = new Set(listed.entries.map((entry) => entry.agent.id));

    const result = await rewriteWith({
      apiEndpoints: [endpoint],
      apiEndpointId: endpoint.id,
      apiModel: endpoint.models[0]!,
    });
    expect(result.status, JSON.stringify(result.error)).toBe("ok");

    const after = await client!.fetchAgents({ filter: {}, page: { limit: 200 } });
    expect(new Set(after.entries.map((entry) => entry.agent.id))).toEqual(before);
    console.log(`[live-api-no-agent] agents=${before.size} unchanged`);
  }, 120_000);
});
