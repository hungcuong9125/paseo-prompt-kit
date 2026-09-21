import type { RewriteError, RewriteOutput } from "../shared/rpc.js";
import type { ApiEndpoint } from "../shared/api-protocol.js";
import type { PromptKitSettings } from "../shared/settings.js";
import { runApiRewrite } from "./api/runner.js";
import { resolveFamily, type CliFamily } from "./cli/family.js";
import { runCliRewrite } from "./cli/runner.js";
import type { CliSpawner } from "./cli/process.js";
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
  /** Test seam: replaces the process spawner under the CLI runner. */
  spawn?: CliSpawner;
  /** Test seam: replaces the HTTP call under the API runner. */
  fetch?: typeof globalThis.fetch;
  /** Test seam: replaces the environment an API key is read from. */
  env?: NodeJS.ProcessEnv;
}

interface ResolvedModel {
  provider: string;
  model: string | null;
  thinkingOptionId: string | null;
}

/**
 * The three rewrite paths, once their model is resolved.
 *
 * `modelMode` and `transport` are separate axes: the first answers *which* model,
 * the second *how it is reached*. The union below is where that becomes concrete
 * — a CLI target needs a family, an API target needs an endpoint — so neither
 * transport has to know about the other's requirements.
 */
type ResolvedTarget =
  | CliTarget
  | { ok: true; via: "api"; endpoint: ApiEndpoint; model: string; reported: ResolvedModel }
  | { ok: false; error: RewriteError };

/** A target a CLI runs: the model plus the family whose binary executes it. */
type CliTarget =
  | { ok: true; via: "cli"; family: CliFamily; model: ResolvedModel; cwd: string }
  | { ok: false; error: RewriteError };

/**
 * The daemon's provider entry may already carry a `provider/model` selector; the
 * agent snapshot's `model` is the bare model id in that case.
 */
function splitSelector(value: string): { provider: string; model: string | null } {
  const separator = value.indexOf("/");
  if (separator === -1) return { provider: value, model: null };
  return { provider: value.slice(0, separator), model: value.slice(separator + 1) };
}

function unsupported(provider: string): RewriteError {
  return {
    code: "unsupported_provider",
    message: `No rewrite CLI is configured for provider "${provider}".`,
  };
}

/**
 * The model the Composer's model control is showing.
 *
 * Paseo resolves that control from `runtimeInfo.model` first and only falls back
 * to the configured model (`composer/agent-controls/utils.ts`,
 * `resolvePreferredModelId`). The runtime value is what the provider's own
 * session reports, so it is the one that can differ from `config.model` when a
 * CLI selects its own default or switches model mid-session. Reading the
 * configured value alone would refuse a rewrite for an agent whose Composer
 * visibly shows a model.
 */
function runtimeModel(agent: { runtimeInfo?: { model?: string | null } | null }): string | null {
  const model = agent.runtimeInfo?.model;
  return typeof model === "string" && model.trim() !== "" ? model : null;
}

async function resolveCurrentAgent(
  paseo: PaseoApi,
  agentId: string,
  providerMap: Readonly<Record<string, string>>,
): Promise<CliTarget> {
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
  const family = resolveFamily(provider, providerMap);
  if (family === null) return { ok: false, error: unsupported(provider) };
  return {
    ok: true,
    via: "cli",
    family,
    model: {
      provider,
      model: runtimeModel(agent) ?? agent.model,
      // `effectiveThinkingOptionId` is the host's own resolution: the runtime
      // option when the session reported one, otherwise the configured option.
      thinkingOptionId: agent.effectiveThinkingOptionId ?? agent.thinkingOptionId ?? null,
    },
    cwd: agent.cwd,
  };
}

/**
 * The model a CLI agent is running, read without requiring a CLI family.
 *
 * `resolveCurrentAgent` also resolves the family, which is the right question for
 * the CLI transport and the wrong one for the API transport: a provider like
 * `grok` has no CLI family yet is perfectly reachable through an endpoint. This
 * reads the same two fields the Composer's model control reads, and nothing else.
 */
async function readAgentModel(paseo: PaseoApi, agentId: string): Promise<ResolvedModel | null> {
  const refreshed = await paseo.agents.ref(agentId).refresh();
  if (!refreshed) return null;
  const agent = refreshed.agent;
  const selector = agent.runtimeInfo?.provider ?? agent.provider;
  return {
    provider: selector.includes("/") ? splitSelector(selector).provider : selector,
    model: runtimeModel(agent) ?? agent.model,
    thinkingOptionId: agent.effectiveThinkingOptionId ?? agent.thinkingOptionId ?? null,
  };
}

async function resolveDedicatedModel(
  paseo: PaseoApi,
  settings: PromptKitSettings,
  cwd: string,
): Promise<CliTarget> {
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
  const family = resolveFamily(provider, settings.providerCli);
  if (family === null) return { ok: false, error: unsupported(provider) };

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
    via: "cli",
    family,
    model: { provider, model, thinkingOptionId: thinking },
    cwd,
  };
}

function invalidSelection(message: string): { ok: false; error: RewriteError } {
  return { ok: false, error: { code: "invalid_selection", message } };
}

/**
 * Paths 1 and 2: the model comes from the agent or from the dedicated selection,
 * and a CLI of the matching family runs it.
 */
async function resolveCliTarget(
  paseo: PaseoApi,
  agentId: string,
  settings: PromptKitSettings,
): Promise<ResolvedTarget> {
  const current = await resolveCurrentAgent(paseo, agentId, settings.providerCli);
  if (!current.ok) return current;

  if (settings.modelMode === "current") {
    if (current.model.model === null || current.model.model === "") {
      return invalidSelection(
        `The agent has no model selected for provider "${current.model.provider}".`,
      );
    }
    return current;
  }

  return resolveDedicatedModel(paseo, settings, current.cwd);
}

/**
 * Path 3: the answer comes straight from an API endpoint.
 *
 * The model has two legitimate sources, and which one applies is decided by
 * configuration rather than guessed:
 *
 * - `apiEndpointByProvider` names an endpoint for the agent's own provider. The
 *   agent's model is then sent, which is the "opencode talks to my own OpenAI
 *   endpoint" case. This takes precedence, because an explicit per-provider
 *   mapping is a stronger statement than a global transport setting.
 * - otherwise `apiEndpointId` + `apiModel` are used, and `modelMode` must be
 *   `dedicated` — there is no agent model to borrow in that case.
 *
 * Note what is deliberately absent: no CLI family is resolved. A provider with no
 * CLI at all (`grok`) is perfectly reachable through an endpoint, so requiring a
 * family here would refuse a valid configuration.
 */
async function resolveApiTarget(
  paseo: PaseoApi,
  agentId: string,
  settings: PromptKitSettings,
): Promise<ResolvedTarget> {
  const agent = await readAgentModel(paseo, agentId);
  if (agent === null) return invalidSelection("The current agent is no longer available.");

  const mappedEndpointId = settings.apiEndpointByProvider[agent.provider];
  const viaProviderMapping = mappedEndpointId !== undefined;
  if (!viaProviderMapping && settings.modelMode !== "dedicated") {
    return invalidSelection(
      "An API transport needs a dedicated model, or an endpoint mapped to this agent's provider.",
    );
  }

  const endpointId = viaProviderMapping ? mappedEndpointId : settings.apiEndpointId;
  if (endpointId === null) {
    return invalidSelection("No API endpoint is selected in PromptKit settings.");
  }
  const endpoint = settings.apiEndpoints.find((candidate) => candidate.id === endpointId);
  if (endpoint === undefined) {
    return {
      ok: false,
      error: {
        code: "api_endpoint_unknown",
        message: `No API endpoint is configured with the id "${endpointId}".`,
      },
    };
  }

  const model = viaProviderMapping ? agent.model : settings.apiModel;
  if (model === null || model.trim() === "") {
    return invalidSelection(
      viaProviderMapping
        ? `The agent has no model selected for provider "${agent.provider}".`
        : "No API model is selected in PromptKit settings.",
    );
  }
  // Catching this here turns a misconfiguration into a named error instead of an
  // HTTP 400 from the endpoint. An endpoint that lists no models is not checked.
  if (endpoint.models.length > 0 && !endpoint.models.includes(model)) {
    return {
      ok: false,
      error: {
        code: "invalid_model",
        message: `Model is unavailable on endpoint "${endpoint.id}": ${model}`,
      },
    };
  }

  return {
    ok: true,
    via: "api",
    endpoint,
    model,
    reported: { provider: endpoint.id, model, thinkingOptionId: null },
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

  // `transport: "api"` is only meaningful together with a model choice, so it is
  // resolved after the model and never as a substitute for it. This is where the
  // two axes meet.
  const target =
    settings.transport === "api"
      ? await resolveApiTarget(paseo, request.agentId, settings)
      : await resolveCliTarget(paseo, request.agentId, settings);
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
    return {
      status: "error",
      error: { code: generated.code, message: generated.message },
    };
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
