import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRpc, useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import {
  actionsListRpc,
  apiTestRpc,
  providerCatalogRpc,
  type ActionSummary,
  type ProviderCatalogOutput,
} from "../../shared/rpc.js";
import { promptKitSettings } from "../../shared/settings.js";
import { enabledActions } from "../actions/enabled.js";
import { useSettingsDraft } from "./draft.js";
import { describeReadiness } from "./readiness.js";
import { ActionsSection } from "./sections/actions-section.js";
import { AdvancedSection } from "./sections/advanced-section.js";
import { ApiEndpointSection } from "./sections/api-endpoint-section.js";
import { DedicatedModelSection } from "./sections/dedicated-model-section.js";
import { EngineSection } from "./sections/engine-section.js";
import { StatusBar } from "./ui/status-bar.js";
import { SPACE, textStyles } from "./ui/tokens.js";

type Providers = ProviderCatalogOutput["providers"];
type ReadySettings = Extract<SettingsState<typeof promptKitSettings.schema>, { status: "ready" }>;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads the two daemon-side lists the screen needs once, with a retry for each.
 * The catalog is read on every transport: the CLI transport needs it for the
 * dedicated pickers and the per-provider CLI map, the API transport for the
 * per-provider endpoint map.
 */
function useCatalogs() {
  const listProviders = useRpc(providerCatalogRpc);
  const listActions = useRpc(actionsListRpc);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [actions, setActions] = useState<readonly ActionSummary[] | null>(null);
  const [actionsError, setActionsError] = useState<string | null>(null);

  const reloadProviders = useCallback(() => {
    setProvidersError(null);
    void listProviders({})
      .then((output) => setProviders(output.providers))
      .catch((error: unknown) => setProvidersError(message(error)));
  }, [listProviders]);

  const reloadActions = useCallback(() => {
    setActionsError(null);
    void listActions({})
      .then((output) => setActions(output.actions))
      .catch((error: unknown) => setActionsError(message(error)));
  }, [listActions]);

  useEffect(() => {
    reloadProviders();
    reloadActions();
  }, [reloadProviders, reloadActions]);

  return { providers, providersError, reloadProviders, actions, actionsError, reloadActions };
}

/**
 * The settings screen: a status bar that says whether a rewrite would run and
 * holds Save/Discard, then the sections in the order a first-time setup reads
 * them. Sections that a choice makes irrelevant are not rendered at all.
 */
function ReadyScreen({ settings, theme, layout }: { settings: ReadySettings } & PluginSurfaceProps) {
  const draft = useSettingsDraft(settings);
  const catalogs = useCatalogs();
  const testEndpoint = useRpc(apiTestRpc);
  const { values } = draft;
  const disabled = draft.saving;

  const enabledCount =
    catalogs.actions === null ? null : enabledActions(catalogs.actions, values).length;
  const readiness = describeReadiness({ values, providers: catalogs.providers, enabledActionCount: enabledCount });
  const actionsChanged = useMemo(
    () => JSON.stringify(values.actionEnabled) !== JSON.stringify(settings.values.actionEnabled),
    [values.actionEnabled, settings.values.actionEnabled],
  );

  return (
    <View style={{ gap: SPACE.lg }}>
      <StatusBar
        theme={theme}
        readiness={readiness}
        draft={draft}
        actionsChanged={actionsChanged}
        compact={layout.compact}
      />

      <ActionsSection
        actions={catalogs.actions}
        error={catalogs.actionsError}
        values={values}
        disabled={disabled}
        patch={draft.patch}
        reload={catalogs.reloadActions}
      />

      <EngineSection values={values} disabled={disabled} patch={draft.patch} />

      {values.transport === "cli" && values.modelMode === "dedicated" ? (
        <DedicatedModelSection
          values={values}
          providers={catalogs.providers}
          providersError={catalogs.providersError}
          disabled={disabled}
          patch={draft.patch}
          reloadProviders={catalogs.reloadProviders}
        />
      ) : null}

      {values.transport === "api" ? (
        <ApiEndpointSection
          values={values}
          disabled={disabled}
          epoch={draft.epoch}
          patch={draft.patch}
          test={(endpoint, secretsFile) => testEndpoint({ endpoint, secretsFile })}
        />
      ) : null}

      <AdvancedSection
        theme={theme}
        values={values}
        providers={catalogs.providers}
        disabled={disabled}
        epoch={draft.epoch}
        patch={draft.patch}
      />
    </View>
  );
}

export function PromptKitSettingsScreen(props: PluginSurfaceProps) {
  const settings = useSettings(promptKitSettings);
  const text = useMemo(() => textStyles(props.theme), [props.theme]);

  if (settings.status === "loading") {
    return <Text style={text.muted}>Loading PromptKit settings…</Text>;
  }
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="PromptKit settings could not be read">
        <SettingsCard>
          <SettingsAction
            label="Try again"
            error={settings.error}
            actionLabel="Reload"
            onPress={() => void settings.reload()}
          />
          {settings.status === "invalid" ? (
            <SettingsAction
              label="Restore default settings"
              hint="Replaces the stored document with the defaults. Endpoints and overrides are lost."
              actionLabel="Reset"
              onPress={() => void settings.reset()}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    );
  }
  return <ReadyScreen {...props} settings={settings} />;
}
