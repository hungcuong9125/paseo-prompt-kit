import { randomUUID } from "node:crypto";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { buildTaskPrompt } from "../../shared/action-registry/wrapper.js";
import { resolveAction } from "../../shared/action-registry/registry.js";
import { buildSystemPrompt } from "../../shared/action-registry/rewrite-contract.js";
import { resolveLanguage } from "../../shared/language-registry/registry.js";
import type { RewriteInput, RewriteOutput, RewriteErrorCode } from "../../shared/rpc.js";
import type { AcpSessions } from "../transports/cli/acp-sessions.js";
import type { CodexSessions } from "../transports/cli/codex-sessions.js";
import type { CliSpawner } from "../transports/cli/process.js";
import { recordRewriteVerdict } from "../rewrite-results.js";
import { createTrace, pluginLog } from "../log.js";
import { runRewrite } from "./engine.js";

export interface RewriteHandlerDependencies {
  /** Test seam: replaces the CLI spawner underneath the rewrite engine. */
  spawn?: CliSpawner;
  /** The warm codex server; the composition root creates one when a test does not. */
  codex?: CodexSessions;
  /** The warm ACP agent per family id; the composition root creates them lazily. */
  acp?: (familyId: string) => AcpSessions;
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
    // Every exit path archives the verdict first: a client whose `rewrite`
    // response was lost must be able to poll the real reason, including the
    // pre-validation refusals below that never reach the engine.
    const archive = (verdict: { ok: boolean; text: string; code?: RewriteErrorCode }): void => {
      if (input.agentId !== null) recordRewriteVerdict(input.agentId, input.requestId, verdict);
    };
    let action: ReturnType<typeof resolveAction>;
    try { action = resolveAction(input.actionId, input.settings.customActions, input.settings.actionOverrides); }
    catch {
      archive({ ok: false, text: "The action instructions are invalid. Fix them in PromptKit settings.", code: "unknown_action" });
      return { status: "error", error: { code: "unknown_action", message: "The action instructions are invalid. Fix them in PromptKit settings." } };
    }
    if (action === null) {
      pluginLog.error({ action: input.actionId }, "rewrite refused: unknown action");
      archive({ ok: false, text: `No action pack provides "${input.actionId}".`, code: "unknown_action" });
      return {
        status: "error",
        error: {
          code: "unknown_action",
          message: `No action pack provides "${input.actionId}".`,
        },
      };
    }

    const enabled = Object.hasOwn(input.settings.actionEnabled, action.id)
      ? input.settings.actionEnabled[action.id] === true
      : action.enabledByDefault;
    if (!enabled) {
      archive({ ok: false, text: "This action is disabled in PromptKit settings.", code: "unknown_action" });
      return { status: "error", error: { code: "unknown_action", message: "This action is disabled in PromptKit settings." } };
    }
    const language = resolveLanguage(input.settings.outputLanguage);
    if (language === undefined) {
      pluginLog.error({ language: input.settings.outputLanguage }, "rewrite refused: unknown language");
      archive({
        ok: false,
        text: `No output language is loaded with the id "${input.settings.outputLanguage}".`,
        code: "invalid_selection",
      });
      return {
        status: "error",
        error: {
          code: "invalid_selection",
          message: `No output language is loaded with the id "${input.settings.outputLanguage}".`,
        },
      };
    }

    const startedAt = Date.now();
    const trace = createTrace(input.settings.debugLog, randomUUID().slice(0, 8));
    trace("rewrite start", {
      action: input.actionId,
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      language: input.settings.outputLanguage,
      transport: input.settings.transport,
      modelMode: input.settings.modelMode,
      timeoutMs: input.settings.timeoutMs,
      draftChars: input.originalPrompt.length,
    });

    const output = await runRewrite(
      paseo,
      {
        agentId: input.agentId,
        workspaceId: input.workspaceId,
        systemPrompt: buildSystemPrompt(action),
        originalPrompt: input.originalPrompt,
        taskPrompt: buildTaskPrompt(action, input.originalPrompt, language?.instruction ?? null),
      },
      {
        settings: input.settings,
        ...(dependencies.spawn === undefined ? {} : { spawn: dependencies.spawn }),
        ...(dependencies.codex === undefined ? {} : { codex: dependencies.codex }),
        ...(dependencies.acp === undefined ? {} : { acp: dependencies.acp }),
        ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
        ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
        trace,
      },
    );

    if (output.status === "ok") {
      pluginLog.info(
        {
          action: input.actionId,
          transport: input.settings.transport,
          provider: output.model.provider,
          model: output.model.model,
          durationMs: output.durationMs,
          modelMs: output.modelMs,
        },
        "rewrite success",
      );
    } else {
      pluginLog.error(
        {
          action: input.actionId,
          transport: input.settings.transport,
          code: output.error.code,
          durationMs: Date.now() - startedAt,
        },
        "rewrite failed",
      );
      trace("rewrite failed", { code: output.error.code });
    }
    // The polling fallback (`prompt-kit.rewrite.result`) reads this: a client
    // whose `rewrite` response was lost on the way back gets the verdict here.
    if (input.agentId !== null) {
      archive(
        output.status === "ok"
          ? { ok: true, text: output.rewrittenPrompt }
          : { ok: false, text: output.error.message, code: output.error.code },
      );
    }
    return output;
  };
}
