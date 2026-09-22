import type { RewriteOutput } from "../../shared/rpc.js";
import type { PromptKitSettings } from "../../shared/settings.js";
import { resolveTarget } from "../model-resolver/resolver.js";
import type { PaseoApi } from "../paseo-types.js";
import { runApiRewrite } from "../transports/api/runner.js";
import type { CliSpawner } from "../transports/cli/process.js";
import { runCliRewrite } from "../transports/cli/runner.js";
import { validateRewriteOutput } from "./output-validator.js";

export interface RewriteRequest {
  agentId: string;
  workspaceId: string;
  systemPrompt: string;
  /** The user's own prompt; protected-literal validation runs against this, not the wrapper. */
  originalPrompt: string;
  taskPrompt: string;
}

export interface RewriteDependencies {
  settings: PromptKitSettings;
  /** Overrides the request timeout; tests use it to exercise the timeout path. */
  timeoutMs?: number;
  /** Test seam: replaces the process spawner under the CLI runner. */
  spawn?: CliSpawner;
  /** Test seam: replaces the HTTP call under the API runner. */
  fetch?: typeof globalThis.fetch;
  /** Test seam: replaces the environment an API key is read from. */
  env?: NodeJS.ProcessEnv;
}

/**
 * One rewrite, end to end: resolve the target, run it over its transport, and
 * validate the answer. The engine knows nothing about *which* action is
 * running — the prompts arrive already built — and nothing about how a model
 * was chosen, which is the resolver's job.
 *
 * Fail closed throughout: a refused target, a failed transport, or a rejected
 * answer is a typed error, and the Composer text is never touched by any of them.
 */
export async function runRewrite(
  paseo: PaseoApi,
  request: RewriteRequest,
  dependencies: RewriteDependencies,
): Promise<RewriteOutput> {
  const startedAt = Date.now();
  const settings = dependencies.settings;
  const timeoutMs = dependencies.timeoutMs ?? settings.timeoutMs;

  const target = await resolveTarget(paseo, request.agentId, settings);
  if (!target.ok) return { status: "error", error: target.error };

  const generated =
    target.via === "api"
      ? await runApiRewrite(
          {
            endpoint: target.endpoint,
            model: target.model,
            systemPrompt: request.systemPrompt,
            taskPrompt: request.taskPrompt,
            timeoutMs,
            secretsDir: settings.secretsFile,
          },
          {
            ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
            ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
          },
        )
      : await runCliRewrite(
          {
            family: target.family,
            model: target.model.model ?? "",
            thinkingOptionId: target.model.thinkingOptionId,
            systemPrompt: request.systemPrompt,
            taskPrompt: request.taskPrompt,
            timeoutMs,
          },
          dependencies.spawn === undefined ? {} : { spawn: dependencies.spawn },
        );
  if (!generated.ok) {
    return { status: "error", error: { code: generated.code, message: generated.message } };
  }

  // Both transports feed the same validator against the same original prompt, so a
  // protected literal cannot survive one path and be dropped by the other.
  const validated = validateRewriteOutput({
    originalPrompt: request.originalPrompt,
    output: generated.text,
  });
  if (!validated.ok) return { status: "error", error: validated.error };

  return {
    status: "ok",
    rewrittenPrompt: validated.text,
    model: target.via === "api" ? target.reported : target.model,
    durationMs: Date.now() - startedAt,
  };
}
