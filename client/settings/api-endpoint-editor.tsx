import { useMemo, useState } from "react";
import { Text } from "react-native";
import {
  SettingsAction,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import type { ApiEndpoint } from "../../shared/api-protocol.js";
import type { ApiTestOutput } from "../../shared/rpc.js";
import {
  ENDPOINT_PRESETS,
  PROTOCOL_OPTIONS,
  endpointFromPreset,
  slugifyId,
  validateEndpoint,
  type EndpointPreset,
} from "./api-endpoints.js";

/**
 * The endpoint editor: a list you can add to, edit in place and remove from.
 *
 * It owns only its own draft and its own test result. The saved settings document
 * is the caller's, so a half-typed endpoint is never persisted: the draft is
 * local, and "Save endpoint" is what hands a validated endpoint back up. That
 * split is why a wrong base URL cannot end up in the document the daemon reads.
 */

const NONE = "";

export interface ApiEndpointEditorProps {
  endpoints: readonly ApiEndpoint[];
  selectedId: string | null;
  disabled: boolean;
  /** The `secretsFile` setting, so the test reads the same file a rewrite would. */
  secretsFile: string | null;
  onSelect(endpointId: string | null): void;
  onChange(endpoints: readonly ApiEndpoint[], selectedId: string | null): void;
  /** Runs the real key lookup and model list against one endpoint. */
  test: (endpoint: ApiEndpoint) => Promise<ApiTestOutput>;
  muted: { color: string };
  style: { color: string };
}

type Draft =
  | { kind: "closed" }
  | { kind: "new"; endpoint: ApiEndpoint }
  | { kind: "edit"; endpoint: ApiEndpoint; originalId: string };

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; models: readonly string[] }
  | { kind: "error"; message: string };

export function ApiEndpointEditor(props: ApiEndpointEditorProps) {
  const [draft, setDraft] = useState<Draft>({ kind: "closed" });
  const [tests, setTests] = useState<Readonly<Record<string, TestState>>>({});
  const [error, setError] = useState<string | null>(null);

  const presetOptions = useMemo(
    () => ENDPOINT_PRESETS.map((preset) => ({ label: preset.label, value: preset.id })),
    [],
  );

  const close = () => {
    setDraft({ kind: "closed" });
    setError(null);
  };

  const commit = () => {
    if (draft.kind === "closed") return;
    const editingId = draft.kind === "edit" ? draft.originalId : null;
    const problem = validateEndpoint(draft.endpoint, props.endpoints, editingId);
    if (problem !== null) {
      setError(problem);
      return;
    }
    const next =
      draft.kind === "edit"
        ? props.endpoints.map((candidate) =>
            candidate.id === draft.originalId ? draft.endpoint : candidate,
          )
        : [...props.endpoints, draft.endpoint];
    // Renaming an endpoint would orphan a mapping that names the old id, so the
    // selection follows the rename and the caller is told the new id.
    props.onChange(next, draft.endpoint.id);
    close();
  };

  const remove = (endpointId: string) => {
    const next = props.endpoints.filter((candidate) => candidate.id !== endpointId);
    props.onChange(next, props.selectedId === endpointId ? null : props.selectedId);
    setTests((previous) => {
      const { [endpointId]: _removed, ...rest } = previous;
      return rest;
    });
  };

  /**
   * Writes the models a successful test discovered into the endpoint.
   *
   * Without this the test would prove the endpoint works and then leave the model
   * picker empty, because the picker reads the endpoint's declared list, not the
   * last test result. Nothing is written silently: the user presses the action.
   */
  const adoptModels = (endpoint: ApiEndpoint, models: readonly string[]) => {
    const next = props.endpoints.map((candidate) =>
      candidate.id === endpoint.id ? { ...candidate, models: [...models] } : candidate,
    );
    props.onChange(next, props.selectedId);
    if (draft.kind !== "closed") {
      setDraft({ ...draft, endpoint: { ...draft.endpoint, models: [...models] } });
    }
  };

  const runTest = async (endpoint: ApiEndpoint) => {
    setTests((previous) => ({ ...previous, [endpoint.id]: { kind: "running" } }));
    try {
      const output = await props.test(endpoint);
      setTests((previous) => ({
        ...previous,
        [endpoint.id]:
          output.status === "ok"
            ? { kind: "ok", models: output.models }
            : { kind: "error", message: output.error.message },
      }));
    } catch (thrown) {
      setTests((previous) => ({
        ...previous,
        [endpoint.id]: {
          kind: "error",
          message: thrown instanceof Error ? thrown.message : String(thrown),
        },
      }));
    }
  };

  const applyPreset = (presetId: string) => {
    const preset = ENDPOINT_PRESETS.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    setDraft({ kind: "new", endpoint: endpointFromPreset(preset) });
    setError(null);
  };

  const edit = (endpoint: ApiEndpoint) => {
    setDraft({ kind: "edit", endpoint: { ...endpoint }, originalId: endpoint.id });
    setError(null);
  };

  return (
    <SettingsSection title="API endpoints">
      <Text style={props.muted}>
        An endpoint is a URL, a protocol, and the name of the variable holding its key. The key
        itself is never stored here — this document reaches your browser. See README, “API keys”.
      </Text>

      {props.endpoints.length === 0 ? (
        <Text style={props.muted}>No endpoint yet. Add one below.</Text>
      ) : (
        props.endpoints.map((endpoint) => {
          const state = tests[endpoint.id] ?? { kind: "idle" };
          const selected = props.selectedId === endpoint.id;
          return (
            <SettingsRow
              key={endpoint.id}
              label={`${endpoint.label}${selected ? "  ✓ in use" : ""}`}
              hint={`${endpoint.protocol} · ${endpoint.baseUrl}${
                endpoint.apiKeyEnv === "" ? " · no key" : ` · key: ${endpoint.apiKeyEnv}`
              }`}
              error={state.kind === "error" ? state.message : null}
            >
              <SettingsAction
                label="Use for rewrites"
                actionLabel={selected ? "In use" : "Use"}
                disabled={props.disabled || selected}
                onPress={() => props.onSelect(endpoint.id)}
              />
              <SettingsAction
                label="Test key and URL"
                actionLabel={state.kind === "running" ? "Testing…" : "Test"}
                disabled={props.disabled || state.kind === "running"}
                onPress={() => void runTest(endpoint)}
              />
              <SettingsAction
                label="Edit"
                actionLabel="Edit"
                disabled={props.disabled}
                onPress={() => edit(endpoint)}
              />
              <SettingsAction
                label="Remove"
                actionLabel="Remove"
                disabled={props.disabled}
                onPress={() => remove(endpoint.id)}
              />
              {state.kind === "ok" ? (
                <>
                  <Text style={props.muted}>
                    {state.models.length === 0
                      ? "Reachable. The endpoint lists no models, so type the model id yourself."
                      : `Reachable. ${state.models.length} models available.`}
                  </Text>
                  {state.models.length > 0 && endpoint.models.length === 0 ? (
                    <SettingsAction
                      label="Use the models this test found"
                      actionLabel="Use them"
                      disabled={props.disabled}
                      onPress={() => adoptModels(endpoint, state.models)}
                    />
                  ) : null}
                </>
              ) : null}
            </SettingsRow>
          );
        })
      )}

      {draft.kind === "closed" ? (
        <>
          <SettingsSelect
            label="Add endpoint"
            value={NONE}
            options={[
              { label: "Choose a provider…", value: NONE },
              ...presetOptions,
            ]}
            disabled={props.disabled}
            onValueChange={(presetId) => {
              if (presetId !== NONE) applyPreset(presetId);
            }}
          />
          <SettingsAction
            label="Something else"
            actionLabel="Custom endpoint"
            disabled={props.disabled}
            onPress={() => {
              setDraft({ kind: "new", endpoint: blankEndpointForUi() });
              setError(null);
            }}
          />
        </>
      ) : (
        <SettingsRow
          label={draft.kind === "edit" ? `Editing ${draft.originalId}` : "New endpoint"}
          error={error}
        >
          <SettingsInput
            label="Label"
            initialValue={draft.endpoint.label}
            placeholder="Groq"
            disabled={props.disabled}
            onChangeText={(label) =>
              setDraft({
                ...draft,
                endpoint: {
                  ...draft.endpoint,
                  label,
                  // A new endpoint derives its id from the label until the user
                  // types an id of their own, so the common case needs no thinking.
                  id:
                    draft.kind === "new" && draft.endpoint.id === slugifyId(draft.endpoint.label)
                      ? slugifyId(label)
                      : draft.endpoint.id,
                },
              })
            }
          />
          <SettingsInput
            label="Id"
            initialValue={draft.endpoint.id}
            placeholder="groq"
            disabled={props.disabled}
            onChangeText={(id) =>
              setDraft({ ...draft, endpoint: { ...draft.endpoint, id } })
            }
          />
          <SettingsSelect
            label="Protocol"
            value={draft.endpoint.protocol}
            options={PROTOCOL_OPTIONS}
            disabled={props.disabled}
            onValueChange={(protocol) =>
              setDraft({
                ...draft,
                endpoint: {
                  ...draft.endpoint,
                  protocol: protocol === "anthropic" || protocol === "gemini" ? protocol : "openai",
                },
              })
            }
          />
          <SettingsInput
            label="Base URL"
            initialValue={draft.endpoint.baseUrl}
            placeholder="https://api.groq.com/openai/v1"
            disabled={props.disabled}
            onChangeText={(baseUrl) =>
              setDraft({ ...draft, endpoint: { ...draft.endpoint, baseUrl } })
            }
          />
          <SettingsInput
            label="Key variable"
            initialValue={draft.endpoint.apiKeyEnv}
            placeholder="GROQ_API_KEY"
            disabled={props.disabled}
            onChangeText={(apiKeyEnv) =>
              setDraft({ ...draft, endpoint: { ...draft.endpoint, apiKeyEnv } })
            }
          />
          <Text style={props.muted}>
            The name of the variable holding the key, not the key. Leave it empty for a local
            server that needs no key.
          </Text>
          <SettingsInput
            label="Models"
            initialValue={draft.endpoint.models.join(", ")}
            placeholder="openai/gpt-oss-20b, openai/gpt-oss-120b"
            disabled={props.disabled}
            onChangeText={(models) =>
              setDraft({
                ...draft,
                endpoint: {
                  ...draft.endpoint,
                  models: models
                    .split(",")
                    .map((model) => model.trim())
                    .filter((model) => model !== ""),
                },
              })
            }
          />
          <Text style={props.muted}>
            Comma separated. Leave empty to accept any model id the endpoint offers.
          </Text>
          <SettingsAction
            label="Test this endpoint before saving"
            actionLabel="Test"
            disabled={props.disabled}
            onPress={() => {
              const problem = validateEndpoint(
                draft.endpoint,
                props.endpoints,
                draft.kind === "edit" ? draft.originalId : null,
              );
              if (problem !== null) {
                setError(problem);
                return;
              }
              setError(null);
              void runTest(draft.endpoint);
            }}
          />
          {(() => {
            const state = tests[draft.endpoint.id];
            if (!state) return null;
            if (state.kind === "running") return <Text style={props.muted}>Testing…</Text>;
            if (state.kind === "error") return <Text style={props.style}>{state.message}</Text>;
            if (state.kind === "ok") {
              return (
                <Text style={props.muted}>
                  {state.models.length === 0
                    ? "Reachable. The endpoint lists no models."
                    : `Reachable. Models: ${state.models.slice(0, 12).join(", ")}${
                        state.models.length > 12 ? ` … (+${state.models.length - 12})` : ""
                      }`}
                </Text>
              );
            }
            return null;
          })()}
          <SettingsAction
            label="Save endpoint"
            actionLabel="Save"
            disabled={props.disabled}
            onPress={commit}
          />
          <SettingsAction
            label="Discard"
            actionLabel="Cancel"
            disabled={props.disabled}
            onPress={close}
          />
        </SettingsRow>
      )}
    </SettingsSection>
  );
}

/** A blank endpoint for the custom flow, with the id field empty rather than "". */
function blankEndpointForUi(): ApiEndpoint {
  return { id: "", label: "", protocol: "openai", baseUrl: "https://", apiKeyEnv: "", models: [] };
}

export type { EndpointPreset };
