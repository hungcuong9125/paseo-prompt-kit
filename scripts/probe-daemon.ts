/**
 * Live daemon probe: calls the installed plugin's `prompt-kit.rewrite` RPC
 * through the real daemon, with a real agent id and the real CLI path.
 *
 * Needs a running daemon and `PASEO_AGENT_ID` pointing at an agent whose
 * provider maps to a supported CLI.
 *
 *   PASEO_AGENT_ID=<uuid> npx tsx scripts/probe-daemon.ts
 */
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { promptKitSettingsSchema } from "../shared/settings.js";

const DAEMON_URL = process.env.PASEO_DAEMON_URL ?? "ws://127.0.0.1:6767/ws";
const AGENT_ID = process.env.PASEO_AGENT_ID;
/** The daemon's own ceiling on one plugin RPC, in the installed Paseo 0.8.0. */
const DAEMON_RPC_CAP_MS = 30_000;

if (!AGENT_ID) {
  console.error("PASEO_AGENT_ID is not set");
  process.exit(2);
}

const client = new DaemonClient({
  url: DAEMON_URL,
  clientId: `prompt-kit-probe-${process.pid}`,
  clientType: "cli",
  appVersion: "0.8.0",
  connectTimeoutMs: 5_000,
});

await client.connect();
const refreshed = await client.fetchAgent(AGENT_ID);
if (!refreshed) throw new Error(`agent not found: ${AGENT_ID}`);
const agent = refreshed.agent;
const composerModel = agent.runtimeInfo?.model ?? agent.model ?? null;
console.log(
  `agent provider=${agent.provider} configModel=${agent.model} ` +
    `runtimeModel=${agent.runtimeInfo?.model ?? null} composerShows=${composerModel} ` +
    `workspace=${agent.workspaceId}`,
);

// The daemon caps one plugin RPC at 30s, so the probe asks for a budget it can
// actually honour. `modelMode` is left at the schema default, which is the
// current-model path: the model the Composer's own control is showing.
const settings = await promptKitSettingsSchema.parseAsync({ timeoutMs: DAEMON_RPC_CAP_MS });
const originalPrompt =
  "sửa lỗi đăng nhập trong /Volumes/DataSSD/app/login.ts, chạy npm run gate";

const startedAt = Date.now();
const output = (await client.invokePluginRpc("prompt-kit", "prompt-kit.rewrite", {
  actionId: "coding",
  agentId: AGENT_ID,
  workspaceId: agent.workspaceId,
  originalPrompt,
  settings,
})) as {
  status: string;
  rewrittenPrompt?: string;
  model?: unknown;
  durationMs?: number;
  error?: { code: string; message: string };
};

console.log(`\n=== daemon rewrite (${((Date.now() - startedAt) / 1000).toFixed(1)}s) ===`);
if (output.status === "ok") {
  console.log(`model: ${JSON.stringify(output.model)}`);
  console.log(`reported durationMs: ${output.durationMs}`);
  console.log(output.rewrittenPrompt);
  for (const literal of ["/Volumes/DataSSD/app/login.ts", "npm run gate"]) {
    console.log(`  keep ${literal}: ${output.rewrittenPrompt?.includes(literal) ? "yes" : "LOST"}`);
  }
} else {
  console.log(`FAILED [${output.error?.code}]: ${output.error?.message}`);
}

// A rewrite must not add a turn to the primary conversation.
const after = await client.fetchAgent(AGENT_ID);
console.log(`\nprimary agent status after rewrite: ${after?.agent.status}`);
await client.close();
