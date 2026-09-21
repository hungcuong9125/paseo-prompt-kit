import type { PluginServerContext } from "@getpaseo/plugin/server";
import { buildTaskPrompt } from "./shared/actions/wrapper.js";
import { listActions, listRejectedPacks, resolveAction } from "./shared/actions/registry.js";
import {
  actionsListRpc,
  providerCatalogRpc,
  rewriteRpc,
  type ActionsListOutput,
  type ProviderCatalogOutput,
  type RewriteOutput,
} from "./shared/rpc.js";
import { promptKitSettings } from "./shared/settings.js";
import { readProviderCatalog } from "./server/provider-catalog.js";
import { runRewrite } from "./server/rewrite.js";
import { pluginLog } from "./server/log.js";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(promptKitSettings);

  const rejected = listRejectedPacks();
  if (rejected.length > 0) {
    pluginLog.error(
      { count: rejected.length, packs: rejected.map((entry) => entry.source).join(",") },
      "action packs rejected",
    );
  }

  server.handle(rewriteRpc, async (input, { paseo }) => {
    const action = resolveAction(input.actionId);
    if (action === null) {
      pluginLog.error({ action: input.actionId }, "rewrite refused: unknown action");
      return {
        status: "error",
        error: {
          code: "unknown_action",
          message: `No action pack provides "${input.actionId}".`,
        },
      } satisfies RewriteOutput;
    }

    pluginLog.info({ action: input.actionId, agentId: input.agentId }, "rewrite start");

    const output = await runRewrite(
      paseo,
      {
        agentId: input.agentId,
        workspaceId: input.workspaceId,
        systemPrompt: action.systemPrompt,
        originalPrompt: input.originalPrompt,
        taskPrompt: buildTaskPrompt(action, input.originalPrompt),
      },
      { settings: input.settings },
    );
    if (output.status === "ok") {
      pluginLog.info(
        {
          action: input.actionId,
          provider: output.model.provider,
          model: output.model.model,
          durationMs: output.durationMs,
        },
        "rewrite success",
      );
    } else {
      pluginLog.error({ action: input.actionId, code: output.error.code }, "rewrite failed");
    }
    return output satisfies RewriteOutput;
  });

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
