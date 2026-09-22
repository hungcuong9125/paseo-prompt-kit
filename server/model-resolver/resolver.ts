import type { ApiEndpoint } from "../../shared/api-protocol.js";
import type { RewriteError } from "../../shared/rpc.js";
import type { PromptKitSettings } from "../../shared/settings.js";
import type { PaseoApi } from "../paseo-types.js";
import { resolveFamily, type CliFamily } from "../transports/cli/family.js";
import { readProviderCatalog } from "./provider-catalog.js";

/** Resolves provider/model/thinking and transport for one request. Runs nothing. */

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

/** `provider/model` selector → provider. */
function providerOf(selector: string): string {
  const separator = selector.indexOf("/");
  return separator === -1 ? selector : selector.slice(0, separator);
}

/** Runtime model first, like the host's `resolvePreferredModelId`. */
function runtimeModel(agent: { runtimeInfo?: { model?: string | null } | null }): string | null {
  const model = agent.runtimeInfo?.model;
  return typeof model === "string" && model.trim() !== "" ? model : null;
}

/** Reads the agent without requiring a CLI family; only the current-CLI path needs one. */
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
const NO_AGENT_YET =
  "This Composer has no agent yet, so there is no current model to use. Choose a dedicated model or Direct API in PromptKit settings, or send the first message and use the PromptKit pill.";

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

/** Path 2: dedicated provider CLI, checked against the live catalog. */
async function resolveDedicatedCli(
  paseo: PaseoApi,
  settings: PromptKitSettings,
  cwd: string | undefined,
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
    cwd: cwd ?? "",
  };
}

/** Path 3: API endpoint. A mapped provider sends its agent's model; otherwise the selected endpoint and model. `modelMode` is not read. */
function resolveApi(agent: AgentModelSnapshot | null, settings: PromptKitSettings): ResolvedTarget {
  const mappedEndpointId = agent === null ? undefined : settings.apiEndpointByProvider[agent.provider];
  const viaProviderMapping = mappedEndpointId !== undefined;

  const endpointId = viaProviderMapping ? mappedEndpointId : settings.apiEndpointId;
  if (endpointId === null) {
    return invalidSelection(
      agent === null
        ? "No API endpoint is selected in PromptKit settings."
        : `No API endpoint is selected in PromptKit settings, and provider "${agent.provider}" is not mapped to one.`,
    );
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

  const model = viaProviderMapping && agent !== null ? agent.model : settings.apiModel;
  if (model === null || model.trim() === "") {
    return invalidSelection(
      viaProviderMapping && agent !== null
        ? `The agent has no model selected for provider "${agent.provider}".`
        : "No API model is selected in PromptKit settings.",
    );
  }
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

export async function resolveTarget(
  paseo: PaseoApi,
  agentId: string | null,
  settings: PromptKitSettings,
): Promise<ResolvedTarget> {
  // Draft Composer: only agent-dependent paths refuse.
  if (agentId === null) {
    if (settings.transport === "api") return resolveApi(null, settings);
    if (settings.modelMode !== "dedicated") return invalidSelection(NO_AGENT_YET);
    return resolveDedicatedCli(paseo, settings, undefined);
  }

  const agent = await readAgent(paseo, agentId);
  if (agent === null) return invalidSelection(AGENT_GONE);

  if (settings.transport === "api") return resolveApi(agent, settings);
  if (settings.modelMode === "dedicated") return resolveDedicatedCli(paseo, settings, agent.cwd);
  return resolveCurrentCli(agent, settings);
}
