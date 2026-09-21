import { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import {
  useRpc,
  useSettings,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { providerCatalogRpc, type ProviderCatalogOutput } from "../../shared/rpc.js";
import { promptKitSettings, type PromptKitSettings } from "../../shared/settings.js";
import { validateDedicatedSelection } from "./selection.js";

type Providers = ProviderCatalogOutput["providers"];

const modeOptions = [
  { label: "Current agent model", value: "current" },
  { label: "Dedicated model", value: "dedicated" },
] as const;

/** Empty string is the "no selection" option; the schema stores null for it. */
const NONE = "";

function catalogOptions(providers: Providers): readonly { label: string; value: string }[] {
  return providers.map((provider) => ({
    label: provider.available ? provider.label : `${provider.label} (unavailable)`,
    value: provider.provider,
  }));
}

function modelOptions(providers: Providers, providerId: string | null) {
  const entry = providers.find((provider) => provider.provider === providerId);
  return (entry?.models ?? []).map((model) => ({ label: model.label, value: model.id }));
}

function thinkingOptions(providers: Providers, providerId: string | null, modelId: string | null) {
  const entry = providers.find((provider) => provider.provider === providerId);
  const model = entry?.models.find((candidate) => candidate.id === modelId);
  return (model?.thinkingOptions ?? []).map((option) => ({ label: option.label, value: option.id }));
}

interface Draft {
  values: PromptKitSettings;
  revision: string;
}

export function PromptKitSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(promptKitSettings);
  const listProviders = useRpc(providerCatalogRpc);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  const muted = useMemo(() => ({ color: theme.colors.foregroundMuted }), [theme]);

  const loadProviders = useCallback(() => {
    setProvidersError(null);
    void listProviders({})
      .then((output) => setProviders(output.providers))
      .catch((error: unknown) =>
        setProvidersError(error instanceof Error ? error.message : String(error)),
      );
  }, [listProviders]);

  const base = settings.status === "ready" ? settings : null;
  const dedicated = base?.values.modelMode === "dedicated";
  useEffect(() => {
    if (dedicated && providers === null) loadProviders();
  }, [dedicated, providers, loadProviders]);

  const update = useCallback(
    (patch: Partial<PromptKitSettings>) => {
      if (!base) return;
      setSaved(false);
      setDraft((previous) =>
        previous
          ? { ...previous, values: { ...previous.values, ...patch } }
          : { values: { ...base.values, ...patch }, revision: base.revision },
      );
    },
    [base],
  );

  const values = draft?.values ?? base?.values;
  const revision = draft?.revision ?? base?.revision;

  const save = useCallback(async () => {
    if (!base || !values || revision === undefined) return;
    const ok = await base.save(values, revision);
    setSaved(ok);
    if (ok) setDraft(null);
  }, [base, values, revision]);

  if (settings.status === "loading") return <Text style={style}>Loading PromptKit settings…</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="PromptKit">
        <Text style={style}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction
            label="Restore default settings"
            actionLabel="Reset"
            onPress={settings.reset}
          />
        ) : null}
      </SettingsSection>
    );
  }
  if (!values || revision === undefined) return null;

  const selectionError = providers ? validateDedicatedSelection(values, providers) : null;
  const disabled = settings.saving;

  return (
    <SettingsSection title="PromptKit">
      <SettingsCard>
        <SettingsSelect
          label="Rewrite model"
          value={values.modelMode}
          options={modeOptions}
          disabled={disabled}
          onValueChange={(modelMode) =>
            update({ modelMode: modelMode === "dedicated" ? "dedicated" : "current" })
          }
        />
        {values.modelMode === "dedicated" ? (
          <>
            <SettingsSelect
              label="Provider"
              value={values.dedicatedProvider ?? NONE}
              options={[
                { label: "Select a provider", value: NONE },
                ...catalogOptions(providers ?? []),
              ]}
              disabled={disabled}
              onValueChange={(provider) =>
                update({
                  dedicatedProvider: provider === NONE ? null : provider,
                  dedicatedModel: null,
                  dedicatedThinkingOptionId: null,
                })
              }
            />
            <SettingsSelect
              label="Model"
              value={values.dedicatedModel ?? NONE}
              options={[
                { label: "Select a model", value: NONE },
                ...modelOptions(providers ?? [], values.dedicatedProvider),
              ]}
              disabled={disabled}
              onValueChange={(model) =>
                update({
                  dedicatedModel: model === NONE ? null : model,
                  dedicatedThinkingOptionId: null,
                })
              }
            />
            <SettingsSelect
              label="Thinking"
              value={values.dedicatedThinkingOptionId ?? NONE}
              options={[
                { label: "Model default", value: NONE },
                ...thinkingOptions(
                  providers ?? [],
                  values.dedicatedProvider,
                  values.dedicatedModel,
                ),
              ]}
              disabled={disabled}
              onValueChange={(thinking) =>
                update({ dedicatedThinkingOptionId: thinking === NONE ? null : thinking })
              }
            />
            <SettingsAction
              label="Provider catalog"
              actionLabel={providers ? "Refresh" : "Load"}
              disabled={disabled}
              onPress={loadProviders}
            />
          </>
        ) : null}
        <SettingsInput
          label="Timeout (ms)"
          initialValue={String(values.timeoutMs)}
          disabled={disabled}
          onChangeText={(text) => {
            const parsed = Number.parseInt(text, 10);
            if (Number.isFinite(parsed)) update({ timeoutMs: parsed });
          }}
        />
        <SettingsAction
          label="Save settings"
          actionLabel="Save"
          disabled={disabled}
          onPress={() => void save()}
        />
      </SettingsCard>
      {providersError ? <Text style={style}>{providersError}</Text> : null}
      {selectionError ? (
        <SettingsRow label="Dedicated model" error={selectionError}>
          <Text style={muted}>PromptKit will not rewrite until this selection is valid.</Text>
        </SettingsRow>
      ) : null}
      {settings.saveError ? <Text style={style}>{settings.saveError}</Text> : null}
      {saved ? <Text style={muted}>Saved.</Text> : null}
    </SettingsSection>
  );
}
