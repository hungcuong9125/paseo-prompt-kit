import { useState } from "react";
import { SettingsCard, SettingsInput, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { CLI_FAMILY_IDS, isCliFamilyId } from "../../../shared/cli-families.js";
import type { ProviderCatalogOutput } from "../../../shared/rpc.js";
import { TIMEOUT_MS, type PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";
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

/** Timeout, secrets dir, per-provider maps. Collapsed by default. */
export function AdvancedSection({ theme, values, providers, disabled, epoch, patch }: AdvancedSectionProps) {
  const [open, setOpen] = useState(false);
  const timeout = describeTimeout(values.timeoutMs);

  return (
    <SettingsSection
      title="Advanced"
      info="Timeout, where secrets.json lives, and per-provider overrides. Most setups never need these."
      trailing={
        <Button
          theme={theme}
          label={open ? "Hide" : "Show"}
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
              label="Timeout (ms)"
              hint={timeout.note ?? `How long one rewrite may run. Default ${TIMEOUT_MS.default.toLocaleString()} ms.`}
              error={timeout.error}
              initialValue={String(values.timeoutMs)}
              placeholder={String(TIMEOUT_MS.default)}
              disabled={disabled}
              onChangeText={(text) => {
                const parsed = Number(text.trim());
                patch({ timeoutMs: Number.isFinite(parsed) ? parsed : Number.NaN });
              }}
            />
            {values.transport === "api" ? (
              <SettingsInput
                key={`${epoch}-secrets`}
                label="Secrets directory"
                hint="Directory holding secrets.json. Empty means <PASEO_HOME>/plugin-settings/prompt-kit."
                initialValue={values.secretsFile ?? ""}
                placeholder="/Users/me/.paseo/plugin-settings/prompt-kit"
                disabled={disabled}
                onChangeText={(text) => patch({ secretsFile: text.trim() === "" ? null : text.trim() })}
              />
            ) : null}
          </SettingsCard>

          {values.transport === "cli" ? (
            <ProviderMapCard
              title="CLI per provider"
              hint="Paseo names most providers after their CLI, so the family is read from the id and no entry is needed. Map only a provider whose id does not say which CLI runs it; an unresolved provider is refused, never guessed."
              providers={providers}
              map={values.providerCli}
              targets={CLI_FAMILY_IDS.map((family) => ({ label: family, value: family }))}
              emptyTargetsLabel="No CLI family is available."
              errorFor={(providerId, family) =>
                isCliFamilyId(family) ? null : `"${family}" is not a supported CLI.`
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
              title="Endpoint per provider"
              hint="When you press the pill in an agent of a mapped provider, that agent's own model is sent to the endpoint over HTTP instead of through its CLI. A mapped provider needs no dedicated model."
              providers={providers}
              map={values.apiEndpointByProvider}
              targets={values.apiEndpoints.map((endpoint) => ({ label: endpoint.label, value: endpoint.id }))}
              emptyTargetsLabel="Add an endpoint above first."
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
            label={`Timeout ${values.timeoutMs.toLocaleString()} ms · ${
              values.transport === "cli"
                ? `${Object.keys(values.providerCli).length} CLI override${Object.keys(values.providerCli).length === 1 ? "" : "s"}`
                : `${Object.keys(values.apiEndpointByProvider).length} mapped provider${Object.keys(values.apiEndpointByProvider).length === 1 ? "" : "s"}`
            }`}
            hint="Press Show to change these."
            error={timeout.error}
          />
        </SettingsCard>
      )}
    </SettingsSection>
  );
}
