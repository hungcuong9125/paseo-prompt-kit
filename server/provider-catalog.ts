import type { PaseoApi } from "@getpaseo/client";
import type { ProviderCatalogOutput } from "../shared/rpc.js";

export type ProviderCatalog = ProviderCatalogOutput["providers"];
export type CatalogProvider = ProviderCatalog[number];
export type CatalogModel = CatalogProvider["models"][number];

/**
 * Providers are reported available only when the daemon's own availability probe
 * says so. A provider missing from that probe is treated as unavailable.
 */
export async function readProviderCatalog(paseo: PaseoApi, cwd?: string): Promise<ProviderCatalog> {
  const options = cwd === undefined ? undefined : { cwd };
  const [snapshot, availability] = await Promise.all([
    paseo.providers.snapshot(options),
    paseo.providers.listAvailable(),
  ]);
  const available = new Map(
    availability.providers.map((entry) => [entry.provider, entry.available]),
  );
  return snapshot.entries
    .map((entry) => ({
      provider: entry.provider,
      label: entry.label ?? entry.provider,
      available: available.get(entry.provider) === true,
      models: (entry.models ?? []).map((model) => ({
        id: model.id,
        label: model.label,
        thinkingOptions: (model.thinkingOptions ?? []).map((option) => ({
          id: option.id,
          label: option.label,
        })),
        defaultThinkingOptionId: model.defaultThinkingOptionId ?? null,
      })),
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
}
