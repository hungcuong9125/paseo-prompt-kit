import type { ProviderCatalogOutput } from "../../shared/rpc.js";
import type { PromptKitSettings } from "../../shared/settings.js";

type Providers = ProviderCatalogOutput["providers"];

/**
 * Null when the selection may run; otherwise the user-facing reason it may not.
 *
 * `transport: "api"` is validated on its own terms: an endpoint must exist, and
 * the model must be either the agent's own (when an endpoint is mapped to the
 * agent's provider) or an explicitly chosen API model. A CLI provider selection
 * is irrelevant on that path, so it is not checked.
 */
export function validateDedicatedSelection(
  settings: PromptKitSettings,
  providers: Providers,
): string | null {
  if (settings.transport === "api") return validateApiSelection(settings);
  if (settings.modelMode !== "dedicated") return null;
  const provider = settings.dedicatedProvider;
  const model = settings.dedicatedModel;
  if (provider === null || model === null) {
    return "Select a dedicated provider and model.";
  }
  const entry = providers.find((candidate) => candidate.provider === provider);
  if (!entry || !entry.available) return `Provider is unavailable: ${provider}`;
  const selected = entry.models.find((candidate) => candidate.id === model);
  if (!selected) return `Model is unavailable: ${provider}/${model}`;
  const thinking = settings.dedicatedThinkingOptionId;
  if (thinking !== null && !selected.thinkingOptions.some((option) => option.id === thinking)) {
    return `Thinking option is unavailable: ${thinking}`;
  }
  return null;
}

/**
 * The API path, checked without a network call so a misconfiguration is caught
 * before the Composer text is touched.
 *
 * A provider mapping satisfies the model requirement on its own: the agent's own
 * model is sent, so no dedicated model has to be chosen.
 */
function validateApiSelection(settings: PromptKitSettings): string | null {
  const mapped = Object.keys(settings.apiEndpointByProvider).length > 0;
  if (!mapped && settings.modelMode !== "dedicated") {
    return "An API transport needs a dedicated model, or an endpoint mapped to a provider.";
  }
  const endpointId = settings.apiEndpointId;
  if (endpointId === null) {
    return mapped
      ? null
      : "Add an API endpoint and select it before rewriting over the API.";
  }
  const endpoint = settings.apiEndpoints.find((candidate) => candidate.id === endpointId);
  if (endpoint === undefined) return `No API endpoint is configured with the id "${endpointId}".`;
  if (settings.modelMode !== "dedicated") return null;
  const model = settings.apiModel;
  if (model === null) return "Select an API model.";
  if (endpoint.models.length > 0 && !endpoint.models.includes(model)) {
    return `Model is unavailable on endpoint "${endpoint.id}": ${model}`;
  }
  return null;
}
