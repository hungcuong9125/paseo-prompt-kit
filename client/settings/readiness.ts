import type { ProviderCatalogOutput } from "../../shared/rpc.js";
import { resolveLanguage } from "../../shared/language-registry/registry.js";
import type { PromptKitSettings } from "../../shared/settings.js";
import { validateDedicatedSelection } from "./selection.js";

type Providers = ProviderCatalogOutput["providers"];

/** Status line: would a rewrite run, over which path, and if not why. Computed from the draft. */
export type Readiness =
  | { kind: "ready"; path: string; detail: string }
  | { kind: "blocked"; path: string; reason: string }
  | { kind: "checking"; path: string; detail: string };

export interface ReadinessInput {
  values: PromptKitSettings;
  /** Null while the catalog has not been read yet. */
  providers: Providers | null;
  /** Null while the action list has not been read yet. */
  enabledActionCount: number | null;
}

function pathLabel(values: PromptKitSettings): string {
  const transport = values.transport === "api" ? "Direct API" : "Provider CLI";
  if (values.transport === "api") {
    const mapped = Object.keys(values.apiEndpointByProvider).length;
    if (values.modelMode === "dedicated") {
      const endpoint = values.apiEndpointId ?? "no endpoint";
      const model = values.apiModel ?? "no model";
      return `${transport} · ${endpoint} · ${model}`;
    }
    return mapped > 0
      ? `${transport} · agent model via ${mapped} mapped provider${mapped === 1 ? "" : "s"}`
      : `${transport} · current agent model`;
  }
  if (values.modelMode === "dedicated") {
    const provider = values.dedicatedProvider ?? "no provider";
    const model = values.dedicatedModel ?? "no model";
    return `${transport} · ${provider} · ${model}`;
  }
  return `${transport} · current agent model`;
}

export function describeReadiness(input: ReadinessInput): Readiness {
  const { values, providers, enabledActionCount } = input;
  const path = pathLabel(values);

  if (enabledActionCount === 0) {
    return {
      kind: "blocked",
      path,
      reason: "No action is enabled, so the Composer shows no PromptKit pill.",
    };
  }

  if (resolveLanguage(values.outputLanguage) === undefined) {
    return {
      kind: "blocked",
      path,
      reason: `No output language is loaded with the id "${values.outputLanguage}".`,
    };
  }

  if (values.transport === "cli" && values.modelMode === "dedicated" && providers === null) {
    return { kind: "checking", path, detail: "Reading the provider catalog…" };
  }

  const problem = validateDedicatedSelection(values, providers ?? []);
  if (problem !== null) return { kind: "blocked", path, reason: problem };

  if (values.transport === "api") {
    return {
      kind: "ready",
      path,
      detail:
        values.modelMode === "dedicated"
          ? "One HTTP request to the selected endpoint. No CLI is started."
          : "Each mapped provider's agent model is sent to its endpoint.",
    };
  }
  return {
    kind: "ready",
    path,
    detail:
      values.modelMode === "dedicated"
        ? "The dedicated provider's CLI runs headlessly in a scratch directory."
        : "The agent's own provider CLI runs the model the Composer shows.",
  };
}
