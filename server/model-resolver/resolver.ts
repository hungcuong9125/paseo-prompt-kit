import type { ApiEndpoint } from "../../shared/api-protocol.js";
import type { RewriteError } from "../../shared/rpc.js";
import type { PromptKitSettings } from "../../shared/settings.js";
import type { PaseoApi } from "../paseo-types.js";
import { resolveFamily, type CliFamily } from "../transports/cli/family.js";
import { readProviderCatalog } from "./provider-catalog.js";

/**
 * Decides provider, model and thinking for one rewrite request, and which
 * transport carries it. Nothing here runs a CLI or sends a request: the engine
 * takes the resolved target and does that.
 *
 * `modelMode` and `transport` are separate axes: the first answers *which*
 * model, the second *how it is reached*. This module is where they meet — a CLI
 * target needs a family, an API target needs an endpoint — so neither transport
 * has to know about the other's requirements.
 */

export interface ResolvedModel {
  readonly provider: string;
  readonly model: string | null;
  readonly thinkingOptionId: string | null;
}

export type ResolvedTarget =
  | { ok: true; via: "cli"; family: CliFamily; model: ResolvedModel; cwd: string }
  | { ok: true; via: "api"; endpoint: ApiEndpoint; model: string; reported: ResolvedModel }
  | { ok: false; error: RewriteError };

/** What the resolver needs to know about the agent whose pill was pressed. */
interface AgentModelSnapshot {
  readonly provider: string;
  readonly model: string | null;
  readonly thinkingOptionId: string | null;
  readonly cwd: string;
}

/**
 * The daemon's provider entry may already carry a `provider/model` selector; the
 * agent snapshot's `model` is the bare model id in that case.
 */
function providerOf(selector: string): string {
  const separator = selector.indexOf("/");
  return separator === -1 ? selector : selector.slice(0, separator);
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

/**
 * Reads the agent the same way the Composer's model control does, and nothing
 * more. No CLI family is required here: which family, if any, runs the agent is
 * a question only the *current* CLI path asks, and asking it for every path
 * would refuse a dedicated or API rewrite from an agent whose provider has no
 * CLI at all.
 */
async function readAgent(paseo: PaseoApi, agentId: string): Promise<AgentModelSnapshot | null> {
  const refreshed = await paseo.agents.ref(agentId).refresh();
  if (!refreshed) return null;
  const agent = refreshed.agent;
  return {
    provider: providerOf(agent.runtimeInfo?.provider ?? agent.provider),
    model: runtimeModel(agent) ?? agent.model,
    // `effectiveThinkingOptionId` is the host's own resolution: the runtime
    // option when the session reported one, otherwise the configured option.
    thinkingOptionId: agent.effectiveThinkingOptionId ?? agent.thinkingOptionId ?? null,
    cwd: agent.cwd,
  };
}

function invalidSelection(message: string): { ok: false; error: RewriteError } {
  return { ok: false, error: { code: "invalid_selection", message } };
}

function invalidModel(message: string): { ok: false; error: RewriteError } {
  return { ok: false, error: { code: "invalid_model", message } };
}

function unsupported(provider: string): { ok: false; error: RewriteError } {
  return {
    ok: false,
    error: {
      code: "unsupported_provider",
      message: `No rewrite CLI is configured for provider "${provider}".`,
    },
  };
}

const AGENT_GONE = "The current agent is no longer available.";

/** Path 1: the agent's own provider CLI, with the model the Composer shows. */
function resolveCurrentCli(agent: AgentModelSnapshot, settings: PromptKitSettings): ResolvedTarget {
  const family = resolveFamily(agent.provider, settings.providerCli);
  if (family === null) return unsupported(agent.provider);
  if (agent.model === null || agent.model === "") {
    return invalidSelection(`The agent has no model selected for provider "${agent.provider}".`);
  }
  return {
    ok: true,
    via: "cli",
    family,
    model: { provider: agent.provider, model: agent.model, thinkingOptionId: agent.thinkingOptionId },
    cwd: agent.cwd,
  };
}

/**
 * Path 2: the dedicated provider's CLI with the model the user picked. The
 * selection is checked against the live catalog so a provider that went away
 * or a model that was renamed is refused before anything is spawned.
 */
async function resolveDedicatedCli(
  paseo: PaseoApi,
  settings: PromptKitSettings,
  cwd: string,
): Promise<ResolvedTarget> {
  const provider = settings.dedicatedProvider;
  const model = settings.dedicatedModel;
  if (provider === null || model === null) {
    return invalidSelection("No dedicated provider and model are selected in PromptKit settings.");
  }
  const family = resolveFamily(provider, settings.providerCli);
  if (family === null) return unsupported(provider);

  let catalog: Awaited<ReturnType<typeof readProviderCatalog>>;
  try {
    catalog = await readProviderCatalog(paseo, cwd);
  } catch (error) {
    return invalidModel(
      `Could not read the provider catalog: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const entry = catalog.find((candidate) => candidate.provider === provider);
  if (!entry || !entry.available) return invalidModel(`Provider is unavailable: ${provider}`);
  const selected = entry.models.find((candidate) => candidate.id === model);
  if (!selected) return invalidModel(`Model is unavailable: ${provider}/${model}`);
  const thinking = settings.dedicatedThinkingOptionId;
  if (thinking !== null && !selected.thinkingOptions.some((option) => option.id === thinking)) {
    return invalidModel(`Thinking option is unavailable: ${provider}/${model} ${thinking}`);
  }
  return {
    ok: true,
    via: "cli",
    family,
    model: { provider, model, thinkingOptionId: thinking },
    cwd,
  };
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
 */
function resolveApi(agent: AgentModelSnapshot, settings: PromptKitSettings): ResolvedTarget {
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
    return invalidModel(`Model is unavailable on endpoint "${endpoint.id}": ${model}`);
  }

  return {
    ok: true,
    via: "api",
    endpoint,
    model,
    reported: { provider: endpoint.id, model, thinkingOptionId: null },
  };
}

/**
 * The one entry point. Reads the agent once, then resolves along the axis the
 * settings select. Every refusal is a typed error and nothing has been run.
 */
export async function resolveTarget(
  paseo: PaseoApi,
  agentId: string,
  settings: PromptKitSettings,
): Promise<ResolvedTarget> {
  const agent = await readAgent(paseo, agentId);
  if (agent === null) return invalidSelection(AGENT_GONE);

  if (settings.transport === "api") return resolveApi(agent, settings);
  if (settings.modelMode === "dedicated") return resolveDedicatedCli(paseo, settings, agent.cwd);
  return resolveCurrentCli(agent, settings);
}
