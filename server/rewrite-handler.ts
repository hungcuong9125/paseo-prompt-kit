import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { buildTaskPrompt } from "../shared/actions/wrapper.js";
import { resolveAction } from "../shared/actions/registry.js";
import type { RewriteInput, RewriteOutput } from "../shared/rpc.js";
import type { CliSpawner } from "./cli/process.js";
import { pluginLog } from "./log.js";
import { runRewrite } from "./rewrite.js";

export interface RewriteHandlerDependencies {
  /** Test seam: replaces the CLI spawner underneath the rewrite engine. */
  spawn?: CliSpawner;
  /** Test seam: replaces the HTTP call underneath the API runner. */
  fetch?: typeof globalThis.fetch;
  /** Test seam: replaces the environment an API key is read from. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Builds the `prompt-kit.rewrite` handler.
 *
 * It owns one job: turn an RPC input into a `runRewrite` call and log the
 * outcome without ever writing prompt or answer text. The spawner is a
 * parameter rather than a module global so a test can drive the handler without
 * launching a real CLI.
 */
export function createRewriteHandler(dependencies: RewriteHandlerDependencies = {}) {
  return async function handleRewrite(
    input: RewriteInput,
    { paseo }: PluginHandlerContext,
  ): Promise<RewriteOutput> {
    const action = resolveAction(input.actionId);
    if (action === null) {
      pluginLog.error({ action: input.actionId }, "rewrite refused: unknown action");
      return {
        status: "error",
        error: {
          code: "unknown_action",
          message: `No action pack provides "${input.actionId}".`,
        },
      };
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
      {
        settings: input.settings,
        ...(dependencies.spawn === undefined ? {} : { spawn: dependencies.spawn }),
        ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
        ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
      },
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
    return output;
  };
}
