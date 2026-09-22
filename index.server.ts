import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listActions, listRejectedPacks } from "./shared/action-registry/registry.js";
import { listRejectedLanguages } from "./shared/language-registry/registry.js";
import {
  actionsListRpc,
  apiTestRpc,
  providerCatalogRpc,
  rewriteRpc,
  type ActionsListOutput,
  type ApiTestOutput,
  type ProviderCatalogOutput,
} from "./shared/rpc.js";
import { promptKitSettings } from "./shared/settings.js";
import { testApiEndpoint } from "./server/transports/api/runner.js";
import { readProviderCatalog } from "./server/model-resolver/provider-catalog.js";
import { createRewriteHandler, type RewriteHandlerDependencies } from "./server/rewrite-engine/handler.js";
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

  server.handle(rewriteRpc, createRewriteHandler(dependencies));

  server.handle(actionsListRpc, () => {
    return {
      actions: listActions().map((action) => ({
        id: action.id,
        version: action.version,
        enabledByDefault: action.enabledByDefault,
        title: action.title,
        description: action.description,
        icon: action.icon,
      })),
    } satisfies ActionsListOutput;
  });

  server.handle(providerCatalogRpc, async (input, { paseo }) => {
    const providers = await readProviderCatalog(paseo, input.cwd);
    return { providers } satisfies ProviderCatalogOutput;
  });

  // The settings screen's test button. It shares the rewrite path's key lookup, so
  // "test passed" means the same thing a rewrite would find.
  server.handle(apiTestRpc, async (input) => {
    const result = await testApiEndpoint(
      { endpoint: input.endpoint, secretsDir: input.secretsFile, timeoutMs: 15_000 },
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

  return () => {};
}
