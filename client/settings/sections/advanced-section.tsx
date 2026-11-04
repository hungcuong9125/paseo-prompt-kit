import { useState } from "react";
import { SettingsCard, SettingsInput, SettingsRow, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { CLI_FAMILY_IDS, isCliFamilyId } from "../../../shared/cli-families.js";
import type { ProviderCatalogOutput } from "../../../shared/rpc.js";
import { TIMEOUT_MS, type PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";
import { useI18n } from "../../i18n/core.js";
import { Button } from "../ui/button.js";
import { ProviderMapCard } from "./provider-map-card.js";
import { describeTimeout } from "../validation.js";

type Providers = ProviderCatalogOutput["providers"];

export interface AdvancedSectionProps {
  theme: PluginTheme;
  values: PromptKitSettings;
  providers: Providers | null;
  disabled: boolean;
  epoch: number;
  patch(update: SettingsPatch): void;
}

const NONE = "";

/** Timeout, debug log, per-provider maps. Collapsed by default. */
export function AdvancedSection({ theme, values, providers, disabled, epoch, patch }: AdvancedSectionProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const timeout = describeTimeout(values.timeoutMs);
  const timeoutDefault = TIMEOUT_MS.default.toLocaleString();

  return (
    <SettingsSection
      title={t("advanced.title")}
      info={t("advanced.info")}
      trailing={
        <Button
          theme={theme}
          label={open ? t("common.hide") : t("common.show")}
          onPress={() => setOpen((current) => !current)}
          testID="prompt-kit-advanced-toggle"
        />
      }
    >
      {open ? (
        <>
          <SettingsCard>
            <SettingsInput
              key={`${epoch}-timeout`}
              label={t("advanced.timeout.label")}
              hint={timeout.note ?? t("advanced.timeout.hint.default", { default: timeoutDefault })}
              error={timeout.error}
              initialValue={String(values.timeoutMs)}
              placeholder={String(TIMEOUT_MS.default)}
              disabled={disabled}
              onChangeText={(text) => {
                const parsed = Number(text.trim());
                patch({ timeoutMs: Number.isFinite(parsed) ? parsed : Number.NaN });
              }}
            />
            <SettingsSwitch
              label={t("advanced.debug.label")}
              hint={t("advanced.debug.hint")}
              value={values.debugLog}
              disabled={disabled}
              onValueChange={(next) => patch({ debugLog: next })}
            />
          </SettingsCard>

          {values.transport === "cli" ? (
            <ProviderMapCard
              title={t("advanced.cliMap.title")}
              hint={t("advanced.cliMap.hint")}
              providers={providers}
              map={values.providerCli}
              targets={CLI_FAMILY_IDS.map((family) => ({ label: family, value: family }))}
              emptyTargetsLabel={t("advanced.cliMap.empty")}
              errorFor={(providerId, family) =>
                isCliFamilyId(family) ? null : t("advanced.cliMap.error", { family })
              }
              disabled={disabled}
              onSet={(providerId, family) =>
                patch((current) => ({
                  providerCli: isCliFamilyId(family)
                    ? { ...current.providerCli, [providerId]: family }
                    : current.providerCli,
                }))
              }
              onRemove={(providerId) =>
                patch((current) => {
                  const next = { ...current.providerCli };
                  delete next[providerId];
                  return { providerCli: next };
                })
              }
            />
          ) : (
            <ProviderMapCard
              title={t("advanced.apiMap.title")}
              hint={t("advanced.apiMap.hint")}
              providers={providers}
              map={values.apiEndpointByProvider}
              targets={values.apiEndpoints.map((endpoint) => ({ label: endpoint.label, value: endpoint.id }))}
              emptyTargetsLabel={t("advanced.apiMap.empty")}
              disabled={disabled}
              onSet={(providerId, endpointId) =>
                patch((current) => ({
                  apiEndpointByProvider: { ...current.apiEndpointByProvider, [providerId]: endpointId },
                }))
              }
              onRemove={(providerId) =>
                patch((current) => {
                  const next = { ...current.apiEndpointByProvider };
                  delete next[providerId];
                  return { apiEndpointByProvider: next };
                })
              }
            />
          )}
        </>
      ) : (
        <SettingsCard>
          <SettingsRow
            label={`${t("advanced.summary.timeout", { ms: values.timeoutMs.toLocaleString() })}${
              values.debugLog ? t("advanced.summary.debugOn") : ""
            } · ${
              values.transport === "cli"
                ? t("advanced.summary.cliOverrides", {
                    count: Object.keys(values.providerCli).length,
                    s: Object.keys(values.providerCli).length === 1 ? "" : "s",
                  })
                : t("advanced.summary.mapped", {
                    count: Object.keys(values.apiEndpointByProvider).length,
                    s: Object.keys(values.apiEndpointByProvider).length === 1 ? "" : "s",
                  })
            }`}
            hint={t("advanced.summary.hint")}
            error={timeout.error}
          />
        </SettingsCard>
      )}
    </SettingsSection>
  );
}
