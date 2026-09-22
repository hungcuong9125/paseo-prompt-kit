import { useState } from "react";
import { SettingsAction, SettingsCard, SettingsInput, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import type { ProviderCatalogOutput } from "../../../shared/rpc.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";
import { MODEL_FILTER_THRESHOLD, describeFilter, filterModels } from "../model-filter.js";

type Providers = ProviderCatalogOutput["providers"];

export interface DedicatedModelSectionProps {
  values: PromptKitSettings;
  /** Null until the catalog has been read. */
  providers: Providers | null;
  providersError: string | null;
  disabled: boolean;
  patch(update: SettingsPatch): void;
  reloadProviders(): void;
}

/** Empty string is the "no selection" option; the schema stores null for it. */
const NONE = "";

/** Dedicated provider/model/thinking for the CLI transport, with per-row errors. */
export function DedicatedModelSection({
  values,
  providers,
  providersError,
  disabled,
  patch,
  reloadProviders,
}: DedicatedModelSectionProps) {
  const [query, setQuery] = useState("");
  const catalog = providers ?? [];
  const provider = catalog.find((entry) => entry.provider === values.dedicatedProvider);
  const model = provider?.models.find((entry) => entry.id === values.dedicatedModel);
  const modelOptions = (provider?.models ?? []).map((entry) => ({ label: entry.label, value: entry.id }));
  const shownModels = filterModels(modelOptions, query, values.dedicatedModel);

  const providerError =
    values.dedicatedProvider === null
      ? "Choose a provider."
      : providers !== null && (provider === undefined || !provider.available)
        ? `Provider is unavailable: ${values.dedicatedProvider}`
        : null;
  const modelError =
    values.dedicatedModel === null
      ? "Choose a model."
      : provider !== undefined && model === undefined
        ? `Model is unavailable: ${values.dedicatedModel}`
        : null;
  const thinkingError =
    values.dedicatedThinkingOptionId !== null &&
    model !== undefined &&
    !model.thinkingOptions.some((option) => option.id === values.dedicatedThinkingOptionId)
      ? `Thinking option is unavailable: ${values.dedicatedThinkingOptionId}`
      : null;

  return (
    <SettingsSection
      title="Dedicated model"
      info="Read from the daemon's provider catalog. A provider marked unavailable has no working CLI or credentials on the daemon host."
    >
      <SettingsCard>
        <SettingsSelect
          label="Provider"
          error={providerError}
          value={values.dedicatedProvider ?? NONE}
          options={[
            { label: providers === null ? "Loading…" : "Select a provider", value: NONE },
            ...catalog.map((entry) => ({
              label: entry.available ? entry.label : `${entry.label} (unavailable)`,
              value: entry.provider,
            })),
          ]}
          disabled={disabled || providers === null}
          onValueChange={(next) => {
            setQuery("");
            patch({
              dedicatedProvider: next === NONE ? null : next,
              dedicatedModel: null,
              dedicatedThinkingOptionId: null,
            });
          }}
        />
        {modelOptions.length > MODEL_FILTER_THRESHOLD ? (
          <SettingsInput
            key={`filter-${values.dedicatedProvider ?? ""}`}
            label="Filter models"
            hint={describeFilter(modelOptions.length, filterModels(modelOptions, query).length, query)}
            initialValue=""
            placeholder="flash, llama, @cf/meta…"
            disabled={disabled}
            onChangeText={setQuery}
          />
        ) : null}
        <SettingsSelect
          label="Model"
          error={providerError === null ? modelError : null}
          value={values.dedicatedModel ?? NONE}
          options={[{ label: "Select a model", value: NONE }, ...shownModels]}
          disabled={disabled || provider === undefined}
          onValueChange={(next) =>
            patch({ dedicatedModel: next === NONE ? null : next, dedicatedThinkingOptionId: null })
          }
        />
        <SettingsSelect
          label="Thinking"
          hint="Model default unless you choose one."
          error={thinkingError}
          value={values.dedicatedThinkingOptionId ?? NONE}
          options={[
            { label: "Model default", value: NONE },
            ...(model?.thinkingOptions ?? []).map((option) => ({
              label: option.label,
              value: option.id,
            })),
          ]}
          disabled={disabled || model === undefined || model.thinkingOptions.length === 0}
          onValueChange={(next) => patch({ dedicatedThinkingOptionId: next === NONE ? null : next })}
        />
        <SettingsAction
          label="Provider catalog"
          hint={
            providers === null
              ? "Not read yet."
              : `${catalog.filter((entry) => entry.available).length} of ${catalog.length} providers available.`
          }
          error={providersError}
          actionLabel="Refresh"
          disabled={disabled}
          onPress={reloadProviders}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
