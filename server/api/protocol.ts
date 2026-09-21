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

/** Everything a protocol needs to ask an endpoint what models it offers. */
export interface ApiModelsCall {
  readonly baseUrl: string;
  readonly apiKey: string;
}

export interface ApiProtocol {
  readonly id: ApiProtocolId;
  /** `null` means the answer could not be read; the runner maps that to a code. */
  buildRequest(call: ApiCall): ApiHttpRequest;
  parseResponse(payload: unknown): string | null;
  /**
   * The request that lists the models this endpoint offers. Used by the settings
   * screen's test button, which is the only way a user learns whether a key and a
   * base URL are right before a rewrite fails on them.
   */
  buildModelsRequest(input: ApiModelsCall): ApiHttpRequest;
  parseModelsResponse(payload: unknown): string[];
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

/**
 * Collects the string values at `path` into a de-duplicated list.
 *
 * Every protocol lists models as an array of objects with one identifying field,
 * so this is the shared half of `parseModelsResponse` for all three.
 */
export function stringFieldAt(payload: unknown, path: readonly (string | number)[], field: string): string[] {
  const list = at(payload, ...path);
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (entry === null || typeof entry !== "object") continue;
    const value = (entry as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim() !== "") seen.add(value.trim());
  }
  return [...seen];
}
