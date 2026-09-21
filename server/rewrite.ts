import type { RewriteError, RewriteOutput } from "../shared/rpc.js";
import type { PromptKitSettings } from "../shared/settings.js";
import { generateRewrite } from "./generation.js";
import { validateRewriteOutput } from "./output-validator.js";
import type { PaseoApi } from "./paseo-types.js";
import { readProviderCatalog } from "./provider-catalog.js";

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
}

interface ResolvedModel {
  provider: string;
  model: string | null;
  thinkingOptionId: string | null;
}

type ResolvedTarget =
  | { ok: true; model: ResolvedModel; cwd: string }
  | { ok: false; error: RewriteError };

function toSelector(provider: string, model: string | null): string {
  return model === null || model === "" ? provider : `${provider}/${model}`;
}

/**
 * The daemon's provider entry may already carry a `provider/model` selector; the
 * agent snapshot's `model` is the bare model id in that case.
 */
function splitSelector(value: string): { provider: string; model: string | null } {
  const separator = value.indexOf("/");
  if (separator === -1) return { provider: value, model: null };
  return { provider: value.slice(0, separator), model: value.slice(separator + 1) };
}

async function resolveCurrentAgent(
  paseo: PaseoApi,
  agentId: string,
): Promise<ResolvedTarget> {
  const refreshed = await paseo.agents.ref(agentId).refresh();
  if (!refreshed) {
    return {
      ok: false,
      error: {
        code: "invalid_selection",
        message: "The current agent is no longer available.",
      },
    };
  }
  const agent = refreshed.agent;
  const selector = agent.runtimeInfo?.provider ?? agent.provider;
  const provider = selector.includes("/") ? splitSelector(selector).provider : selector;
  return {
    ok: true,
    model: {
      provider,
      model: agent.model,
      thinkingOptionId: agent.effectiveThinkingOptionId ?? agent.thinkingOptionId ?? null,
    },
    cwd: agent.cwd,
  };
}

async function resolveDedicatedModel(
  paseo: PaseoApi,
  settings: PromptKitSettings,
  cwd: string,
): Promise<ResolvedTarget> {
  const provider = settings.dedicatedProvider;
  const model = settings.dedicatedModel;
  if (provider === null || model === null) {
    return {
      ok: false,
      error: {
        code: "invalid_selection",
        message: "No dedicated provider and model are selected in PromptKit settings.",
      },
    };
  }
  let catalog: Awaited<ReturnType<typeof readProviderCatalog>>;
  try {
    catalog = await readProviderCatalog(paseo, cwd);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "invalid_model",
        message: `Could not read the provider catalog: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
  const entry = catalog.find((candidate) => candidate.provider === provider);
  if (!entry || !entry.available) {
    return {
      ok: false,
      error: { code: "invalid_model", message: `Provider is unavailable: ${provider}` },
    };
  }
  const selected = entry.models.find((candidate) => candidate.id === model);
  if (!selected) {
    return {
      ok: false,
      error: { code: "invalid_model", message: `Model is unavailable: ${provider}/${model}` },
    };
  }
  const thinking = settings.dedicatedThinkingOptionId;
  if (
    thinking !== null &&
    !selected.thinkingOptions.some((option) => option.id === thinking)
  ) {
    return {
      ok: false,
      error: {
        code: "invalid_model",
        message: `Thinking option is unavailable: ${provider}/${model} ${thinking}`,
      },
    };
  }
  return {
    ok: true,
    model: { provider, model, thinkingOptionId: thinking },
    cwd,
  };
}

export async function runRewrite(
  paseo: PaseoApi,
  request: RewriteRequest,
  dependencies: RewriteDependencies,
): Promise<RewriteOutput> {
  const startedAt = Date.now();
  const settings = dependencies.settings;
  const timeoutMs = dependencies.timeoutMs ?? settings.timeoutMs;

  const current = await resolveCurrentAgent(paseo, request.agentId);
  if (!current.ok) return { status: "error", error: current.error };

  const target =
    settings.modelMode === "current"
      ? current
      : await resolveDedicatedModel(paseo, settings, current.cwd);
  if (!target.ok) return { status: "error", error: target.error };

  const generated = await generateRewrite(paseo, {
    workspaceId: request.workspaceId,
    provider: toSelector(target.model.provider, target.model.model),
    thinkingOptionId: target.model.thinkingOptionId,
    systemPrompt: request.systemPrompt,
    taskPrompt: request.taskPrompt,
    timeoutMs,
  });
  if (!generated.ok) return { status: "error", error: generated.error };

  const validated = validateRewriteOutput({
    originalPrompt: request.originalPrompt,
    output: generated.text,
  });
  if (!validated.ok) return { status: "error", error: validated.error };

  return {
    status: "ok",
    rewrittenPrompt: validated.text,
    model: target.model,
    durationMs: Date.now() - startedAt,
  };
}
