import type { ProviderCatalogOutput } from "../../shared/rpc.js";
import type { PromptKitSettings } from "../../shared/settings.js";

type Providers = ProviderCatalogOutput["providers"];

/** Null when the selection may run; otherwise the user-facing reason it may not. */
export function validateDedicatedSelection(
  settings: PromptKitSettings,
  providers: Providers,
): string | null {
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
