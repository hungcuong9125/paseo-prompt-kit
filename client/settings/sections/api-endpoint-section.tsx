import { useMemo, useState } from "react";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import type { ApiEndpoint, ApiProtocolId } from "../../../shared/api-protocol.js";
import type { ApiTestOutput } from "../../../shared/rpc.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import {
  ENDPOINT_PRESETS,
  PROTOCOL_OPTIONS,
  endpointFromPreset,
  validateEndpoint,
} from "../api-endpoints.js";
import type { SettingsPatch } from "../draft.js";

export interface ApiEndpointSectionProps {
  values: PromptKitSettings;
  disabled: boolean;
  /** Bumps when the draft is discarded or saved, so text fields re-read their value. */
  epoch: number;
  patch(update: SettingsPatch): void;
  /** Runs the real key lookup and model list against one endpoint. */
  test(endpoint: ApiEndpoint, secretsFile: string | null): Promise<ApiTestOutput>;
}

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; models: number }
  | { kind: "error"; message: string };

const NONE = "";
/** The value of the "add an endpoint that is not a preset" option. */
const CUSTOM = "__custom__";
const PRESET_IDS: ReadonlySet<string> = new Set(ENDPOINT_PRESETS.map((preset) => preset.id));

/** A free id for a custom endpoint, so two of them cannot collide. */
function nextCustomId(endpoints: readonly ApiEndpoint[]): string {
  for (let n = 1; ; n += 1) {
    const id = `custom-${n}`;
    if (!endpoints.some((endpoint) => endpoint.id === id)) return id;
  }
}

function withEndpoint(
  endpoints: readonly ApiEndpoint[],
  id: string,
  changes: Partial<ApiEndpoint>,
): ApiEndpoint[] {
  return endpoints.map((endpoint) => (endpoint.id === id ? { ...endpoint, ...changes } : endpoint));
}

/** Pick endpoint → fill details → Test → pick model. One picker for presets and custom entries. */
export function ApiEndpointSection({ values, disabled, epoch, patch, test }: ApiEndpointSectionProps) {
  const [tests, setTests] = useState<Readonly<Record<string, TestState>>>({});

  const selected = values.apiEndpoints.find((endpoint) => endpoint.id === values.apiEndpointId) ?? null;
  const selectedIsPreset = selected !== null && PRESET_IDS.has(selected.id);
  const testState: TestState = selected === null ? { kind: "idle" } : (tests[selected.id] ?? { kind: "idle" });
  const problem = selected === null ? null : validateEndpoint(selected, values.apiEndpoints, selected.id);

  const endpointOptions = useMemo(() => {
    const custom = values.apiEndpoints.filter((endpoint) => !PRESET_IDS.has(endpoint.id));
    return [
      { label: "Choose an endpoint…", value: NONE },
      ...ENDPOINT_PRESETS.map((preset) => ({ label: `${preset.label} — ${preset.note}`, value: preset.id })),
      ...custom.map((endpoint) => ({ label: endpoint.label, value: endpoint.id })),
      { label: "Custom endpoint…", value: CUSTOM },
    ];
  }, [values.apiEndpoints]);

  const modelOptions = useMemo(() => {
    const declared = (selected?.models ?? []).map((model) => ({ label: model, value: model }));
    // Keep the saved model selectable even if the endpoint no longer lists it.
    if (values.apiModel !== null && !declared.some((option) => option.value === values.apiModel)) {
      return [{ label: values.apiModel, value: values.apiModel }, ...declared];
    }
    return declared;
  }, [selected, values.apiModel]);

  /** Choosing an endpoint selects one that exists or adds it from its preset. */
  const choose = (choice: string) => {
    patch((current) => {
      if (choice === NONE) return { apiEndpointId: null, apiModel: null };
      if (current.apiEndpoints.some((endpoint) => endpoint.id === choice)) {
        return {
          apiEndpointId: choice,
          // The model belongs to one endpoint, so switching endpoint drops it.
          apiModel: choice === current.apiEndpointId ? current.apiModel : null,
        };
      }
      if (choice === CUSTOM) {
        const id = nextCustomId(current.apiEndpoints);
        return {
          apiEndpoints: [
            ...current.apiEndpoints,
            {
              id,
              label: "Custom endpoint",
              protocol: "openai" as ApiProtocolId,
              baseUrl: "https://",
              apiKeyEnv: "",
              models: [],
            },
          ],
          apiEndpointId: id,
          apiModel: null,
        };
      }
      const preset = ENDPOINT_PRESETS.find((candidate) => candidate.id === choice);
      if (preset === undefined) return {};
      return {
        apiEndpoints: [...current.apiEndpoints, endpointFromPreset(preset)],
        apiEndpointId: preset.id,
        apiModel: null,
      };
    });
  };

  const edit = (changes: Partial<ApiEndpoint>) => {
    if (selected === null) return;
    const id = selected.id;
    patch((current) => ({ apiEndpoints: withEndpoint(current.apiEndpoints, id, changes) }));
  };

  const remove = () => {
    if (selected === null) return;
    const id = selected.id;
    patch((current) => ({
      apiEndpoints: current.apiEndpoints.filter((endpoint) => endpoint.id !== id),
      apiEndpointId: null,
      apiModel: null,
      apiEndpointByProvider: Object.fromEntries(
        Object.entries(current.apiEndpointByProvider).filter(([, target]) => target !== id),
      ),
    }));
  };

  const runTest = async (endpoint: ApiEndpoint) => {
    setTests((previous) => ({ ...previous, [endpoint.id]: { kind: "running" } }));
    try {
      const output = await test(endpoint, values.secretsFile);
      if (output.status === "ok") {
        setTests((previous) => ({ ...previous, [endpoint.id]: { kind: "ok", models: output.models.length } }));
        // Test fills the model list; an empty answer leaves it alone.
        if (output.models.length > 0) {
          const models = [...output.models];
          patch((current) => ({ apiEndpoints: withEndpoint(current.apiEndpoints, endpoint.id, { models }) }));
        }
      } else {
        setTests((previous) => ({
          ...previous,
          [endpoint.id]: { kind: "error", message: output.error.message },
        }));
      }
    } catch (thrown) {
      setTests((previous) => ({
        ...previous,
        [endpoint.id]: { kind: "error", message: thrown instanceof Error ? thrown.message : String(thrown) },
      }));
    }
  };

  const testHint =
    testState.kind === "ok"
      ? testState.models === 0
        ? "Reachable, but the endpoint lists no models. Type the model id below."
        : `Reachable. ${testState.models} models are now in the model list below.`
      : "Asks the endpoint which models it offers, with the same key lookup a rewrite uses.";

  return (
    <SettingsSection
      title="API endpoint"
      info="The key itself is never stored here, because this document reaches your browser. Store the name of the variable that holds it, and put the value in the daemon's environment or in secrets.json. See README, “API keys”."
    >
      <SettingsCard>
        <SettingsSelect
          label="Endpoint"
          hint={selected === null ? "Choosing a preset adds it; it is saved with the screen." : undefined}
          error={selected === null ? "API rewrites will not run until an endpoint is chosen." : null}
          value={values.apiEndpointId ?? NONE}
          options={endpointOptions}
          disabled={disabled}
          onValueChange={choose}
        />

        {selected === null ? null : (
          <>
            {selectedIsPreset ? null : (
              <>
                <SettingsInput
                  key={`${epoch}-${selected.id}-label`}
                  label="Name"
                  initialValue={selected.label}
                  placeholder="My endpoint"
                  disabled={disabled}
                  onChangeText={(label) => edit({ label })}
                />
                <SettingsSelect
                  key={`${selected.id}-protocol`}
                  label="Protocol"
                  hint="Which wire shape the endpoint speaks."
                  value={selected.protocol}
                  options={PROTOCOL_OPTIONS}
                  disabled={disabled}
                  onValueChange={(protocol) =>
                    edit({ protocol: protocol === "anthropic" || protocol === "gemini" ? protocol : "openai" })
                  }
                />
              </>
            )}
            <SettingsInput
              key={`${epoch}-${selected.id}-baseUrl`}
              label="Base URL"
              error={problem !== null && problem.includes("base URL") ? problem : null}
              initialValue={selected.baseUrl}
              placeholder="https://api.groq.com/openai/v1"
              disabled={disabled}
              onChangeText={(baseUrl) => edit({ baseUrl })}
            />
            <SettingsInput
              key={`${epoch}-${selected.id}-key`}
              label="Key variable"
              hint="The name of the variable, not the key. Leave empty for a local server."
              initialValue={selected.apiKeyEnv}
              placeholder="GROQ_API_KEY"
              disabled={disabled}
              onChangeText={(apiKeyEnv) => edit({ apiKeyEnv })}
            />
            <SettingsAction
              label="Connection"
              hint={testHint}
              error={testState.kind === "error" ? testState.message : null}
              actionLabel={testState.kind === "running" ? "Testing…" : "Test"}
              disabled={disabled || problem !== null || testState.kind === "running"}
              onPress={() => void runTest(selected)}
            />

            {selected.models.length > 0 ? (
              <SettingsSelect
                label="Model"
                hint="Which model the rewrite asks this endpoint for. A provider mapped under Advanced sends its own model instead."
                error={values.apiModel === null ? "Choose a model." : null}
                value={values.apiModel ?? NONE}
                options={[{ label: "Select a model", value: NONE }, ...modelOptions]}
                disabled={disabled}
                onValueChange={(apiModel) => patch({ apiModel: apiModel === NONE ? null : apiModel })}
              />
            ) : (
              <SettingsInput
                key={`${epoch}-${selected.id}-apiModel`}
                label="Model"
                hint="This endpoint has not listed its models. Press Test to fill the list, or type the id."
                error={values.apiModel === null ? "Choose a model." : null}
                initialValue={values.apiModel ?? ""}
                placeholder="gemini-2.5-flash"
                disabled={disabled}
                onChangeText={(model) => patch({ apiModel: model.trim() === "" ? null : model.trim() })}
              />
            )}

            <SettingsAction
              label="Remove endpoint"
              hint="Drops it from this document. A preset can be added again from the list."
              actionLabel="Remove"
              disabled={disabled}
              onPress={remove}
            />
          </>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
