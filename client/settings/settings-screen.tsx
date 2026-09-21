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
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { actionsListRpc, apiTestRpc, providerCatalogRpc, type ActionsListOutput, type ProviderCatalogOutput } from "../../shared/rpc.js";
import type { ApiEndpoint } from "../../shared/api-protocol.js";
import { promptKitSettings, type PromptKitSettings } from "../../shared/settings.js";
import { CLI_FAMILY_IDS, isCliFamilyId } from "../../shared/cli-families.js";
import { enabledActions } from "../actions/enabled.js";
import { validateDedicatedSelection } from "./selection.js";
import { ApiEndpointEditor } from "./api-endpoint-editor.js";

type Providers = ProviderCatalogOutput["providers"];
type ActionSummary = ActionsListOutput["actions"][number];

const modeOptions = [
  { label: "Current agent model", value: "current" },
  { label: "Dedicated model", value: "dedicated" },
] as const;

const transportOptions = [
  { label: "Provider CLI", value: "cli" },
  { label: "Direct API", value: "api" },
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

/** The models the selected API endpoint declares. An endpoint may declare none. */
function apiModelOptions(
  endpoints: readonly ApiEndpoint[],
  endpointId: string | null,
): readonly { label: string; value: string }[] {
  const endpoint = endpoints.find((candidate) => candidate.id === endpointId);
  return (endpoint?.models ?? []).map((model) => ({ label: model, value: model }));
}

interface Draft {
  values: PromptKitSettings;
  revision: string;
}

export function PromptKitSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(promptKitSettings);
  const listProviders = useRpc(providerCatalogRpc);
  const listActions = useRpc(actionsListRpc);
  const testEndpoint = useRpc(apiTestRpc);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [actions, setActions] = useState<ActionSummary[] | null>(null);
  const [actionsError, setActionsError] = useState<string | null>(null);
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

  const loadActions = useCallback(() => {
    setActionsError(null);
    void listActions({})
      .then((output) => setActions(output.actions))
      .catch((error: unknown) =>
        setActionsError(error instanceof Error ? error.message : String(error)),
      );
  }, [listActions]);

  const base = settings.status === "ready" ? settings : null;
  const dedicated = base?.values.modelMode === "dedicated";
  useEffect(() => {
    if (dedicated && providers === null) loadProviders();
  }, [dedicated, providers, loadProviders]);
  useEffect(() => {
    if (actions === null) loadActions();
  }, [actions, loadActions]);

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

  /**
   * Records that one Paseo provider is run by one CLI family.
   *
   * Paseo names most providers after their CLI (`pi-peer`, `codex-lead`), and
   * the plugin resolves those on its own. An entry here is for a profile whose
   * id does not say which CLI runs it; without one that provider is refused
   * rather than guessed at.
   */
  const setProviderCli = useCallback(
    (provider: string, family: string) => {
      if (!values) return;
      const next = { ...values.providerCli };
      if (!isCliFamilyId(family)) delete next[provider];
      else next[provider] = family;
      update({ providerCli: next });
    },
    [update, values],
  );

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
        <SettingsSection title="Actions">
          {actionsError ? <Text style={style}>{actionsError}</Text> : null}
          {actions === null ? (
            <Text style={style}>Loading actions…</Text>
          ) : actions.length === 0 ? (
            <Text style={muted}>No action pack is loaded.</Text>
          ) : (
            actions.map((action) => (
              <SettingsSwitch
                key={action.id}
                label={action.title}
                hint={action.description}
                value={enabledActions([action], values).length === 1}
                disabled={disabled}
                onValueChange={(next) =>
                  update({
                    actionEnabled: { ...values.actionEnabled, [action.id]: next },
                  })
                }
              />
            ))
          )}
          <Text style={muted}>
            A change here applies to the Composer pill when the agent re-opens or the plugin reloads.
          </Text>
        </SettingsSection>
        <SettingsSelect
          label="Transport"
          value={values.transport}
          options={transportOptions}
          disabled={disabled}
          onValueChange={(transport) =>
            update({ transport: transport === "api" ? "api" : "cli" })
          }
        />
        <SettingsSelect
          label="Rewrite model"
          value={values.modelMode}
          options={modeOptions}
          disabled={disabled}
          onValueChange={(modelMode) =>
            update({ modelMode: modelMode === "dedicated" ? "dedicated" : "current" })
          }
        />
        {values.transport === "api" ? (
          <>
            <ApiEndpointEditor
              endpoints={values.apiEndpoints}
              selectedId={values.apiEndpointId}
              disabled={disabled}
              secretsFile={values.secretsFile}
              muted={muted}
              style={style}
              onSelect={(endpointId) => update({ apiEndpointId: endpointId, apiModel: null })}
              onChange={(apiEndpoints, selected) =>
                update({
                  apiEndpoints: [...apiEndpoints],
                  apiEndpointId: selected,
                  // A removed or renamed endpoint must not stay referenced, so the
                  // model choice is dropped whenever the endpoint changes.
                  apiModel: null,
                })
              }
              test={(endpoint) =>
                testEndpoint({ endpoint, secretsFile: values.secretsFile })
              }
            />
            {values.modelMode === "dedicated" ? (
              <SettingsSelect
                label="API model"
                value={values.apiModel ?? NONE}
                options={[
                  { label: "Select a model", value: NONE },
                  ...apiModelOptions(values.apiEndpoints, values.apiEndpointId),
                ]}
                disabled={disabled}
                hint="Pick one of the endpoint's models, or type an id in the editor above."
                onValueChange={(apiModel) =>
                  update({ apiModel: apiModel === NONE ? null : apiModel })
                }
              />
            ) : null}
          </>
        ) : null}
        {values.transport === "cli" && values.modelMode === "dedicated" ? (
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
            <SettingsSection title="Provider CLI">
              <Text style={muted}>
                Paseo already runs each provider through its own CLI, and PromptKit drives that
                same CLI headlessly. Most providers need no entry here: a profile named after its
                CLI (`pi-peer`, `codex-lead`) resolves on its own. Map a provider below only when
                its name does not say which CLI runs it. An unmapped provider is refused, never
                guessed.
              </Text>
              {(providers ?? [])
                .filter((provider) => provider.available)
                .map((provider) => (
                  <SettingsSelect
                    key={provider.provider}
                    label={provider.label}
                    value={values.providerCli[provider.provider] ?? NONE}
                    options={[
                      { label: "Resolve from the provider id", value: NONE },
                      ...CLI_FAMILY_IDS.map((family) => ({ label: family, value: family })),
                    ]}
                    disabled={disabled}
                    onValueChange={(family) => setProviderCli(provider.provider, family)}
                  />
                ))}
            </SettingsSection>
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
