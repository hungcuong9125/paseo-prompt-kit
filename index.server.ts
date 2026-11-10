import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listRejectedPacks, summarizeActions } from "./shared/action-registry/registry.js";
import { listRejectedLanguages } from "./shared/language-registry/registry.js";
import {
  actionsListRpc,
  apiTestRpc,
  providerCatalogRpc,
  rewriteResultRpc,
  rewriteRpc,
  secretsStatusRpc,
  secretsWriteRpc,
  type ApiTestOutput,
  type ProviderCatalogOutput,
  type RewriteResultOutput,
} from "./shared/rpc.js";
import { readRewriteVerdict } from "./server/rewrite-results.js";
import { promptKitSettings } from "./shared/settings.js";
import { testApiEndpoint } from "./server/transports/api/runner.js";
import { hasApiKey, writeApiKey } from "./server/transports/api/secrets-store.js";
import { readProviderCatalog } from "./server/model-resolver/provider-catalog.js";
import { createRewriteHandler, type RewriteHandlerDependencies } from "./server/rewrite-engine/handler.js";
import { createAcpSessions, type AcpSessions } from "./server/transports/cli/acp-sessions.js";
import { createCodexSessions } from "./server/transports/cli/codex-sessions.js";
import { findFamily } from "./server/transports/cli/family.js";
import { pluginLog } from "./server/log.js";

/**
 * The composition root. `dependencies` exists so a test can drive the rewrite
 * RPC without launching a real CLI; the host calls this with one argument.
 */
export default function contribute(
  server: PluginServerContext,
  dependencies: RewriteHandlerDependencies = {},
) {
  server.registerSettings(promptKitSettings);

  const rejected = listRejectedPacks();
  if (rejected.length > 0) {
    pluginLog.error(
      { count: rejected.length, packs: rejected.map((entry) => entry.source).join(",") },
      "action packs rejected",
    );
  }

  const rejectedLanguages = listRejectedLanguages();
  if (rejectedLanguages.length > 0) {
    pluginLog.error(
      { count: rejectedLanguages.length, languages: rejectedLanguages.map((entry) => entry.source).join(",") },
      "output languages rejected",
    );
  }

  // One warm codex server for the plugin's lifetime, started on the first codex rewrite.
  const codex = dependencies.codex ?? createCodexSessions();
  // One warm ACP agent per family, created on that family's first rewrite.
  const acpAgents = new Map<string, AcpSessions>();
  const acp = (familyId: string): AcpSessions => {
    const existing = acpAgents.get(familyId);
    if (existing !== undefined) return existing;
    const family = findFamily(familyId);
    if (family === null || family.kind !== "acp") throw new Error(`"${familyId}" is not an ACP family.`);
    const sessions = createAcpSessions(familyId, { command: family.command, args: family.args, cwd: "" });
    acpAgents.set(familyId, sessions);
    return sessions;
  };
  server.handle(rewriteRpc, createRewriteHandler({ ...dependencies, codex, acp }));
  // Fallback read for clients that lost the `rewrite` response on the way back.
  server.handle(rewriteResultRpc, (input): RewriteResultOutput => {
    const verdict = readRewriteVerdict(input.agentId, input.requestId);
    if ("pending" in verdict) return { status: "pending", requestId: input.requestId };
    return verdict.ok
      ? { status: "ok", requestId: verdict.requestId, rewrittenPrompt: verdict.text }
      : {
          status: "error",
          requestId: verdict.requestId,
          error: { code: verdict.code ?? "generation_failed", message: verdict.text },
        };
  });

  server.handle(actionsListRpc, (input) => summarizeActions(input.customActions, input.actionOverrides));

  server.handle(providerCatalogRpc, async (input, { paseo }) => {
    const providers = await readProviderCatalog(paseo, input.cwd);
    return { providers } satisfies ProviderCatalogOutput;
  });

  // The settings screen's test button. It shares the rewrite path's key lookup, so
  // "test passed" means the same thing a rewrite would find.
  server.handle(apiTestRpc, async (input) => {
    const result = await testApiEndpoint(
      { endpoint: input.endpoint, secretsDir: input.secretsDir, timeoutMs: 15_000 },
      dependencies.fetch === undefined && dependencies.env === undefined
        ? {}
        : {
            ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
            ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
          },
    );
    if (!result.ok) {
      return {
        status: "error",
        error: { code: result.code, message: result.message },
      } satisfies ApiTestOutput;
    }
    return { status: "ok", models: [...result.models] } satisfies ApiTestOutput;
  });

  // Write-only key storage for the settings screen; the value is never logged or returned.
  server.handle(secretsWriteRpc, async (input) => {
    const result = await writeApiKey({
      secretsDir: input.secretsDir,
      name: input.name,
      value: input.value,
      ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    });
    return result.ok ? { status: "ok" as const } : { status: "error" as const, message: result.message };
  });

  server.handle(secretsStatusRpc, async (input) => {
    const result = await hasApiKey({
      secretsDir: input.secretsDir,
      name: input.name,
      ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    });
    return result.ok ? { status: "ok" as const, stored: result.stored } : { status: "error" as const, message: result.message };
  });

  return () => {
    codex.close();
    for (const sessions of acpAgents.values()) sessions.close();
  };
}
