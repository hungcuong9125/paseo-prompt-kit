import type { ApiProtocolId } from "../../shared/api-protocol.js";

/**
 * What a protocol module must do: turn one prompt into one HTTP request, and pull
 * the answer text out of the response.
 *
 * Nothing else is shared. Each vendor differs in headers, in where the system
 * prompt goes, and in the shape of the answer, so a protocol module owns those
 * three things and nothing more. Adding a vendor is a settings entry; adding a
 * *protocol* is one file next to these.
 */

export interface ApiCall {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  /** The rewrite instruction. */
  readonly systemPrompt: string;
  readonly taskPrompt: string;
}

export interface ApiHttpRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface ApiProtocol {
  readonly id: ApiProtocolId;
  /** `null` means the answer could not be read; the runner maps that to a code. */
  buildRequest(call: ApiCall): ApiHttpRequest;
  parseResponse(payload: unknown): string | null;
}

/** Strips a trailing slash so a base URL and a path cannot produce a double slash. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

/**
 * An endpoint with no `apiKeyEnv` needs no key — a local server is legitimate —
 * so an empty key means "send no credential header" rather than an error.
 */
export function authHeaders(
  apiKey: string,
  build: (key: string) => Record<string, string>,
): Record<string, string> {
  return apiKey === "" ? {} : build(apiKey);
}

/**
 * Reads a nested value by path, so each parser stays a flat description of the
 * response shape instead of a chain of casts.
 */
export function at(payload: unknown, ...path: readonly (string | number)[]): unknown {
  let current: unknown = payload;
  for (const step of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[step];
  }
  return current;
}
