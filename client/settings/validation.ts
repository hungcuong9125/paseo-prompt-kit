import { actionOverridesSchema } from "../../shared/action-registry/schema.js";
import { listActions } from "../../shared/action-registry/registry.js";
import { TIMEOUT_MS, type PromptKitSettings } from "../../shared/settings.js";
import { isUsableSecretsDir, validateEndpoint } from "./api-endpoints.js";

/** Why the draft cannot be saved, or null. Bounds come from the schema constants. */
export function findSaveProblem(values: PromptKitSettings): string | null {
  const overrides = actionOverridesSchema.safeParse(values.actionOverrides);
  if (!overrides.success) return `Prompt instructions: ${overrides.error.issues[0]?.message ?? "invalid"}`;
  for (const id of Object.keys(overrides.data)) {
    if (!listActions().some((pack) => pack.id === id)) return `No bundled action owns override "${id}".`;
  }
  if (
    !Number.isInteger(values.timeoutMs) ||
    values.timeoutMs < TIMEOUT_MS.min ||
    values.timeoutMs > TIMEOUT_MS.max
  ) {
    return `Timeout must be a whole number between ${TIMEOUT_MS.min.toLocaleString()} and ${TIMEOUT_MS.max.toLocaleString()} ms.`;
  }

  for (const endpoint of values.apiEndpoints) {
    const problem = validateEndpoint(endpoint, values.apiEndpoints, endpoint.id);
    if (problem !== null) return `Endpoint "${endpoint.label || endpoint.id}": ${problem}`;
  }

  if (values.secretsDir !== null && !isUsableSecretsDir(values.secretsDir)) {
    return "The secrets directory must be an absolute path or start with ~/.";
  }

  const ids = new Set(values.apiEndpoints.map((endpoint) => endpoint.id));
  if (values.apiEndpointId !== null && !ids.has(values.apiEndpointId)) {
    return `The selected endpoint "${values.apiEndpointId}" is not configured.`;
  }
  for (const [provider, endpointId] of Object.entries(values.apiEndpointByProvider)) {
    if (!ids.has(endpointId)) {
      return `Provider "${provider}" is mapped to endpoint "${endpointId}", which is not configured.`;
    }
  }
  return null;
}

/** Row message for the timeout: range error, or a note above the host cap. */
export function describeTimeout(timeoutMs: number): { error: string | null; note: string | null } {
  if (!Number.isInteger(timeoutMs) || timeoutMs < TIMEOUT_MS.min || timeoutMs > TIMEOUT_MS.max) {
    return {
      error: `Between ${TIMEOUT_MS.min.toLocaleString()} and ${TIMEOUT_MS.max.toLocaleString()} ms.`,
      note: null,
    };
  }
  if (timeoutMs > TIMEOUT_MS.runCapMs) {
    return {
      error: null,
      note: `Paseo stops waiting for a plugin call after ${TIMEOUT_MS.hostRpcCapMs / 1000} s, so a rewrite stops at ${TIMEOUT_MS.runCapMs / 1000} s and reports a timeout.`,
    };
  }
  return { error: null, note: null };
}
