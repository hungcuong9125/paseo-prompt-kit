import { useState } from "react";
import {
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import { CLI_FAMILY_IDS, isCliFamilyId, resolveCliFamilyId } from "../../../shared/cli-families.js";
import type { ProviderCatalogOutput } from "../../../shared/rpc.js";
import { TIMEOUT_MS, type PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";
import { Button } from "../ui/button.js";
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

/**
 * Everything a first-time setup does not need: the timeout, the secrets
 * directory, and the two per-provider maps. Collapsed by default so the main
 * flow stays three sections long; the header button opens it.
 */
export function AdvancedSection({ theme, values, providers, disabled, epoch, patch }: AdvancedSectionProps) {
  const [open, setOpen] = useState(false);
  const timeout = describeTimeout(values.timeoutMs);
  const available = (providers ?? []).filter((entry) => entry.available);

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
                // A blank or non-numeric field is left as a range error, never
                // silently replaced with a value the user did not type.
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
            <SettingsCard>
              <SettingsRow
                label="CLI per provider"
                hint="Paseo names most providers after their CLI, so the family is read from the id. Override only a provider whose id does not say which CLI runs it. An unresolved provider is refused, never guessed."
              />
              {providers === null ? (
                <SettingsRow label="Loading providers…" />
              ) : available.length === 0 ? (
                <SettingsRow label="No provider is available on the daemon." />
              ) : (
                available.map((entry) => {
                  const automatic = resolveCliFamilyId(entry.provider);
                  return (
                    <SettingsSelect
                      key={entry.provider}
                      label={entry.label}
                      hint={entry.provider}
                      error={
                        resolveCliFamilyId(entry.provider, values.providerCli) === null
                          ? "No CLI resolves for this id; rewrites from it are refused until one is chosen."
                          : null
                      }
                      value={values.providerCli[entry.provider] ?? NONE}
                      options={[
                        { label: automatic === null ? "Automatic: none" : `Automatic: ${automatic}`, value: NONE },
                        ...CLI_FAMILY_IDS.map((family) => ({ label: family, value: family })),
                      ]}
                      disabled={disabled}
                      onValueChange={(family) =>
                        patch((current) => {
                          const next = { ...current.providerCli };
                          if (isCliFamilyId(family)) next[entry.provider] = family;
                          else delete next[entry.provider];
                          return { providerCli: next };
                        })
                      }
                    />
                  );
                })
              )}
            </SettingsCard>
          ) : (
            <SettingsCard>
              <SettingsRow
                label="Endpoint per provider"
                hint="Send a provider's own agent model to one of your endpoints instead of through its CLI. A mapped provider needs no dedicated model."
              />
              {providers === null ? (
                <SettingsRow label="Loading providers…" />
              ) : values.apiEndpoints.length === 0 ? (
                <SettingsRow label="Add an endpoint above first." />
              ) : (
                (providers ?? []).map((entry) => (
                  <SettingsSelect
                    key={entry.provider}
                    label={entry.label}
                    hint={entry.provider}
                    value={values.apiEndpointByProvider[entry.provider] ?? NONE}
                    options={[
                      { label: "Not mapped", value: NONE },
                      ...values.apiEndpoints.map((endpoint) => ({ label: endpoint.label, value: endpoint.id })),
                    ]}
                    disabled={disabled}
                    onValueChange={(endpointId) =>
                      patch((current) => {
                        const next = { ...current.apiEndpointByProvider };
                        if (endpointId === NONE) delete next[entry.provider];
                        else next[entry.provider] = endpointId;
                        return { apiEndpointByProvider: next };
                      })
                    }
                  />
                ))
              )}
            </SettingsCard>
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
