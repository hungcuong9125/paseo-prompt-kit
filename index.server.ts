import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listActions, listRejectedPacks } from "./shared/actions/registry.js";
import {
  actionsListRpc,
  providerCatalogRpc,
  rewriteRpc,
  type ActionsListOutput,
  type ProviderCatalogOutput,
} from "./shared/rpc.js";
import { promptKitSettings } from "./shared/settings.js";
import { readProviderCatalog } from "./server/provider-catalog.js";
import { createRewriteHandler, type RewriteHandlerDependencies } from "./server/rewrite-handler.js";
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

  return () => {};
}
