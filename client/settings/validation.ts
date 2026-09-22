import { TIMEOUT_MS, type PromptKitSettings } from "../../shared/settings.js";
import { validateEndpoint } from "./api-endpoints.js";

/**
 * Why the draft cannot be saved as it stands, or null when it can.
 *
 * The host would refuse an out-of-range or malformed document anyway, but it
 * answers with a schema error. This runs first so the user gets a sentence that
 * names the field, and so an endpoint that cannot work is never written to the
 * document the daemon reads. Every rule here derives from the schema's own
 * bounds; none restates a value the schema does not carry.
 */
export function findSaveProblem(values: PromptKitSettings): string | null {
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

/**
 * The timeout's own row-level message: a range error, or a note that the budget
 * is above what the host will wait for. Null when there is nothing to say.
 */
export function describeTimeout(timeoutMs: number): { error: string | null; note: string | null } {
  if (!Number.isInteger(timeoutMs) || timeoutMs < TIMEOUT_MS.min || timeoutMs > TIMEOUT_MS.max) {
    return {
      error: `Between ${TIMEOUT_MS.min.toLocaleString()} and ${TIMEOUT_MS.max.toLocaleString()} ms.`,
      note: null,
    };
  }
  if (timeoutMs > TIMEOUT_MS.hostRpcCapMs) {
    return {
      error: null,
      note: `Paseo stops waiting for a plugin call after ${TIMEOUT_MS.hostRpcCapMs / 1000} s, so a longer budget is not reached in practice.`,
    };
  }
  return { error: null, note: null };
}
