import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRpc, useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import {
  actionsListRpc,
  apiTestRpc,
  providerCatalogRpc,
  secretsStatusRpc,
  secretsWriteRpc,
  type ActionsListOutput,
  type ProviderCatalogOutput,
} from "../../shared/rpc.js";
import type { ActionPack } from "../../shared/action-registry/schema.js";
import { promptKitSettings } from "../../shared/settings.js";
import { describeEnabledLimit, enabledActions } from "../actions/enabled.js";
import { useSettingsDraft } from "./draft.js";
import { describeReadiness } from "./readiness.js";
import { ActionsSection } from "./sections/actions-section.js";
import { AdvancedSection } from "./sections/advanced-section.js";
import { CustomActionsSection } from "./sections/custom-actions-section.js";
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

/** Provider catalog read once, action list re-read when the custom actions change; both retry. */
function useCatalogs(customActions: readonly ActionPack[]) {
  const listProviders = useRpc(providerCatalogRpc);
  const listActions = useRpc(actionsListRpc);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<ActionsListOutput | null>(null);
  const [actionsError, setActionsError] = useState<string | null>(null);

  const reloadProviders = useCallback(() => {
    setProvidersError(null);
    void listProviders({})
      .then((output) => setProviders(output.providers))
      .catch((error: unknown) => setProvidersError(message(error)));
  }, [listProviders]);

  const customKey = JSON.stringify(customActions);
  const reloadActions = useCallback(() => {
    setActionsError(null);
    void listActions({ customActions: JSON.parse(customKey) as ActionPack[] })
      .then((output) => setRegistry(output))
      .catch((error: unknown) => setActionsError(message(error)));
  }, [listActions, customKey]);

  useEffect(() => {
    reloadProviders();
  }, [reloadProviders]);

  useEffect(() => {
    reloadActions();
  }, [reloadActions]);

  return {
    providers,
    providersError,
    reloadProviders,
    actions: registry?.actions ?? null,
    rejected: registry?.rejected ?? [],
    actionsError,
    reloadActions,
  };
}

/** Status bar, then sections in setup order; irrelevant sections are not rendered. */
function ReadyScreen({ settings, theme, layout }: { settings: ReadySettings } & PluginSurfaceProps) {
  const settingsDraft = useSettingsDraft(settings);
  const catalogs = useCatalogs(settingsDraft.values.customActions);
  // The enabled limit needs the registry, which the draft itself cannot read.
  const limitProblem =
    catalogs.actions === null ? null : describeEnabledLimit(catalogs.actions, settingsDraft.values);
  const draft = { ...settingsDraft, problem: settingsDraft.problem ?? limitProblem };
  const testEndpoint = useRpc(apiTestRpc);
  const keyStatus = useRpc(secretsStatusRpc);
  const writeKey = useRpc(secretsWriteRpc);
  const { values } = draft;
  const disabled = draft.saving;

  const enabledCount =
    catalogs.actions === null ? null : enabledActions(catalogs.actions, values).length;
  const readiness = describeReadiness({ values, providers: catalogs.providers, enabledActionCount: enabledCount });
  const actionsChanged = useMemo(
    () =>
      JSON.stringify([values.actionEnabled, values.customActions]) !==
      JSON.stringify([settings.values.actionEnabled, settings.values.customActions]),
    [values.actionEnabled, values.customActions, settings.values.actionEnabled, settings.values.customActions],
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
        rejected={catalogs.rejected}
        error={catalogs.actionsError}
        values={values}
        disabled={disabled}
        patch={draft.patch}
        reload={catalogs.reloadActions}
      />

      <CustomActionsSection
        theme={theme}
        actions={catalogs.actions}
        values={values}
        disabled={disabled}
        patch={draft.patch}
      />

      <EngineSection theme={theme} compact={layout.compact} values={values} disabled={disabled} patch={draft.patch} />

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
          test={(endpoint, secretsDir) => testEndpoint({ endpoint, secretsDir })}
          keyStatus={keyStatus}
          writeKey={writeKey}
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
