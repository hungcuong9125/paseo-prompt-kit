import type { PluginServerContext } from "@getpaseo/plugin/server";
import { findPromptAction } from "./shared/actions.js";
import {
  providerCatalogRpc,
  rewriteRpc,
  type ProviderCatalogOutput,
  type RewriteOutput,
} from "./shared/rpc.js";
import { promptKitSettings } from "./shared/settings.js";
import { readProviderCatalog } from "./server/provider-catalog.js";
import { runRewrite } from "./server/rewrite.js";
import { pluginLog } from "./server/log.js";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(promptKitSettings);

  server.handle(rewriteRpc, async (input, { paseo }) => {
    const action = findPromptAction(input.actionId);
    pluginLog.info({ action: input.actionId, agentId: input.agentId }, "rewrite start");

    const output = await runRewrite(
      paseo,
      {
        agentId: input.agentId,
        workspaceId: input.workspaceId,
        systemPrompt: action.strategy.systemPrompt(),
        originalPrompt: input.originalPrompt,
        taskPrompt: action.strategy.taskPrompt({ originalPrompt: input.originalPrompt }),
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

  server.handle(providerCatalogRpc, async (input, { paseo }) => {
    const providers = await readProviderCatalog(paseo, input.cwd);
    return { providers } satisfies ProviderCatalogOutput;
  });

  return () => {};
}
