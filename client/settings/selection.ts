import { isAcpFamilyId, resolveCliFamilyId } from "../../shared/cli-families.js";
import type { ProviderCatalogOutput } from "../../shared/rpc.js";
import { tNow } from "../i18n/core.js";
import type { PromptKitSettings } from "../../shared/settings.js";

type Providers = ProviderCatalogOutput["providers"];

/** Null when the selection may run; otherwise the user-facing reason. The API path ignores the CLI fields. */
export function validateDedicatedSelection(
  settings: PromptKitSettings,
  providers: Providers,
): string | null {
  if (settings.transport === "api") return validateApiSelection(settings);
  if (settings.modelMode !== "dedicated") return null;
  const provider = settings.dedicatedProvider;
  const model = settings.dedicatedModel;
  if (provider === null || model === null) {
    return tNow("validate.dedicated.incomplete");
  }
  // Same reason the daemon refuses: an ACP family carries no model selection.
  const familyId = resolveCliFamilyId(provider, settings.providerCli);
  if (familyId !== null && isAcpFamilyId(familyId)) {
    return tNow("validate.dedicated.acp", { provider });
  }
  const entry = providers.find((candidate) => candidate.provider === provider);
  if (!entry || !entry.available) return tNow("validate.dedicated.unavailableProvider", { provider });
  const selected = entry.models.find((candidate) => candidate.id === model);
  if (!selected) return tNow("validate.dedicated.unavailableModel", { provider, model });
  const thinking = settings.dedicatedThinkingOptionId;
  if (thinking !== null && !selected.thinkingOptions.some((option) => option.id === thinking)) {
    return tNow("validate.dedicated.unavailableThinking", { thinking });
  }
  return null;
}

/** API path, no network call. Mappings alone may run; a selected endpoint must be complete. */
function validateApiSelection(settings: PromptKitSettings): string | null {
  const mapped = Object.keys(settings.apiEndpointByProvider).length > 0;
  const endpointId = settings.apiEndpointId;
  if (endpointId === null) {
    return mapped ? null : tNow("validate.api.addEndpoint");
  }
  const endpoint = settings.apiEndpoints.find((candidate) => candidate.id === endpointId);
  if (endpoint === undefined) return tNow("validate.api.unconfigured", { id: endpointId });
  const model = settings.apiModel;
  if (model === null) return tNow("validate.api.selectModel");
  if (endpoint.models.length > 0 && !endpoint.models.includes(model)) {
    return tNow("validate.api.unavailableModel", { id: endpoint.id, model });
  }
  return null;
}
