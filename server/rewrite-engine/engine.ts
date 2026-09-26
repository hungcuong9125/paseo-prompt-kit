import type { RewriteOutput } from "../../shared/rpc.js";
import { effectiveTimeoutMs, type PromptKitSettings } from "../../shared/settings.js";
import { noTrace, type Trace } from "../log.js";
import { resolveTarget } from "../model-resolver/resolver.js";
import type { PaseoApi } from "../paseo-types.js";
import { runApiRewrite } from "../transports/api/runner.js";
import type { CliSpawner } from "../transports/cli/process.js";
import { runCliRewrite } from "../transports/cli/runner.js";
import { validateRewriteOutput } from "./output-validator.js";

export interface RewriteRequest {
  /** Null for a Composer that has no agent yet. */
  agentId: string | null;
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
  /** Debug detail lines; a no-op unless `debugLog` is on. */
  trace?: Trace;
}

/** resolve target → run transport → validate. Every failure is a typed error. */
export async function runRewrite(
  paseo: PaseoApi,
  request: RewriteRequest,
  dependencies: RewriteDependencies,
): Promise<RewriteOutput> {
  const startedAt = Date.now();
  const settings = dependencies.settings;
  const timeoutMs = dependencies.timeoutMs ?? effectiveTimeoutMs(settings.timeoutMs);
  const trace = dependencies.trace ?? noTrace;

  const target = await resolveTarget(paseo, request.agentId, settings);
  if (!target.ok) {
    trace("target refused", { code: target.error.code, message: target.error.message });
    return { status: "error", error: target.error };
  }
  trace("target", {
    via: target.via,
    ...(target.via === "api"
      ? { endpoint: target.endpoint.id, model: target.model }
      : { family: target.family.id, model: target.model.model, thinking: target.model.thinkingOptionId }),
    timeoutMs,
  });

  const generated =
    target.via === "api"
      ? await runApiRewrite(
          {
            endpoint: target.endpoint,
            model: target.model,
            systemPrompt: request.systemPrompt,
            taskPrompt: request.taskPrompt,
            draft: request.originalPrompt,
            timeoutMs,
            secretsDir: settings.secretsDir,
          },
          {
            ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
            ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
            trace,
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
          { ...(dependencies.spawn === undefined ? {} : { spawn: dependencies.spawn }), trace },
        );
  if (!generated.ok) {
    return { status: "error", error: { code: generated.code, message: generated.message } };
  }

  const validated = validateRewriteOutput({
    originalPrompt: request.originalPrompt,
    output: generated.text,
  });
  if (!validated.ok) {
    trace("output refused", { code: validated.error.code, message: validated.error.message, outputChars: generated.text.length });
    return { status: "error", error: validated.error };
  }

  return {
    status: "ok",
    rewrittenPrompt: validated.text,
    model: target.via === "api" ? target.reported : target.model,
    durationMs: Date.now() - startedAt,
  };
}
