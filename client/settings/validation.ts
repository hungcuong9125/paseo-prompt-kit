import { actionOverridesSchema } from "../../shared/action-registry/schema.js";
import { listActions } from "../../shared/action-registry/registry.js";
import { TIMEOUT_MS, type PromptKitSettings } from "../../shared/settings.js";
import { isUsableSecretsDir, validateEndpoint } from "./api-endpoints.js";
import { tNow } from "../i18n/core.js";

/** Why the draft cannot be saved, or null. Bounds come from the schema constants. */
export function findSaveProblem(values: PromptKitSettings): string | null {
  const overrides = actionOverridesSchema.safeParse(values.actionOverrides);
  if (!overrides.success) return tNow("validate.overrides", { message: overrides.error.issues[0]?.message ?? "invalid" });
  for (const id of Object.keys(overrides.data)) {
    if (!listActions().some((pack) => pack.id === id)) return tNow("validate.overrideOwner", { id });
  }
  if (
    !Number.isInteger(values.timeoutMs) ||
    values.timeoutMs < TIMEOUT_MS.min ||
    values.timeoutMs > TIMEOUT_MS.max
  ) {
    return tNow("validate.timeoutRange", {
      min: TIMEOUT_MS.min.toLocaleString(),
      max: TIMEOUT_MS.max.toLocaleString(),
    });
  }

  const seenEndpointIds = new Set<string>();
  for (const endpoint of values.apiEndpoints) {
    if (seenEndpointIds.has(endpoint.id)) {
      return tNow("validate.endpointDuplicate", { id: endpoint.id });
    }
    seenEndpointIds.add(endpoint.id);
    const problem = validateEndpoint(endpoint, values.apiEndpoints, endpoint.id);
    if (problem !== null)
      return tNow("validate.endpointProblem", { name: endpoint.label || endpoint.id, problem });
  }

  if (values.secretsDir !== null && !isUsableSecretsDir(values.secretsDir)) {
    return "The secrets directory must be an absolute path or start with ~/.";
  }

  const ids = new Set(values.apiEndpoints.map((endpoint) => endpoint.id));
  if (values.apiEndpointId !== null && !ids.has(values.apiEndpointId)) {
    return tNow("validate.endpointMissing", { id: values.apiEndpointId });
  }
  for (const [provider, endpointId] of Object.entries(values.apiEndpointByProvider)) {
    if (!ids.has(endpointId)) {
      return tNow("validate.mappingMissing", { provider, endpoint: endpointId });
    }
  }
  return null;
}

/** Row message for the timeout: range error, or a note above the host cap. */
export function describeTimeout(timeoutMs: number): { error: string | null; note: string | null } {
  if (!Number.isInteger(timeoutMs) || timeoutMs < TIMEOUT_MS.min || timeoutMs > TIMEOUT_MS.max) {
    return {
      error: tNow("validate.timeoutRangeShort", {
        min: TIMEOUT_MS.min.toLocaleString(),
        max: TIMEOUT_MS.max.toLocaleString(),
      }),
      note: null,
    };
  }
  if (timeoutMs > TIMEOUT_MS.runCapMs) {
    return {
      error: null,
      note: tNow("validate.timeoutCapNote", {
        host: String(TIMEOUT_MS.hostRpcCapMs / 1000),
        run: String(TIMEOUT_MS.runCapMs / 1000),
      }),
    };
  }
  return { error: null, note: null };
}
