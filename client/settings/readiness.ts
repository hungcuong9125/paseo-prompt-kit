import type { ProviderCatalogOutput } from "../../shared/rpc.js";
import { resolveLanguage } from "../../shared/language-registry/registry.js";
import type { PromptKitSettings } from "../../shared/settings.js";
import { validateDedicatedSelection } from "./selection.js";
import { tNow } from "../i18n/core.js";

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
  const transport = values.transport === "api" ? tNow("path.api") : tNow("path.cli");
  if (values.transport === "api") {
    const mapped = Object.keys(values.apiEndpointByProvider).length;
    const viaMapping = tNow("path.viaMapping", { count: mapped, s: mapped === 1 ? "" : "s" });
    if (values.apiEndpointId === null)
      return `${transport} · ${mapped > 0 ? viaMapping : tNow("path.noEndpoint")}`;
    const selected = `${transport} · ${values.apiEndpointId} · ${values.apiModel ?? tNow("path.noModel")}`;
    return mapped > 0 ? `${selected} · ${viaMapping}` : selected;
  }
  if (values.modelMode === "dedicated") {
    const provider = values.dedicatedProvider ?? tNow("path.noProvider");
    const model = values.dedicatedModel ?? tNow("path.noModel");
    return `${transport} · ${provider} · ${model}`;
  }
  return `${transport} · ${tNow("path.currentModel")}`;
}

export function describeReadiness(input: ReadinessInput): Readiness {
  const { values, providers, enabledActionCount } = input;
  const path = pathLabel(values);

  if (enabledActionCount === 0) {
    return {
      kind: "blocked",
      path,
      reason: tNow("ready.blocked.noActions"),
    };
  }

  if (resolveLanguage(values.outputLanguage) === undefined) {
    return {
      kind: "blocked",
      path,
      reason: tNow("ready.blocked.language", { id: values.outputLanguage }),
    };
  }

  if (values.transport === "cli" && values.modelMode === "dedicated" && providers === null) {
    return { kind: "checking", path, detail: tNow("ready.checking.catalog") };
  }

  const problem = validateDedicatedSelection(values, providers ?? []);
  if (problem !== null) return { kind: "blocked", path, reason: problem };

  if (values.transport === "api") {
    return {
      kind: "ready",
      path,
      detail:
        values.apiEndpointId !== null
          ? tNow("ready.api.endpoint")
          : tNow("ready.api.mapped"),
    };
  }
  return {
    kind: "ready",
    path,
    detail:
      values.modelMode === "dedicated"
        ? tNow("ready.cli.dedicated")
        : tNow("ready.cli.current"),
  };
}
