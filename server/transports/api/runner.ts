import { protocolNeedsAccountId, type ApiEndpoint, type ApiProtocolId } from "../../../shared/api-protocol.js";
import { anthropicProtocol } from "./anthropic.js";
import { cloudflareProtocol } from "./cloudflare.js";
import { geminiProtocol } from "./gemini.js";
import { resolveApiKey, type ApiKeyLookupFailure } from "./key.js";
import { openAiProtocol } from "./openai.js";
import type { ApiProtocol } from "./protocol.js";

/**
 * The rewrite path that talks to an API directly.
 *
 * It is the counterpart of `server/transports/cli/runner.ts` and shares its contract: given
 * a model and a prompt, return text or a typed reason there is none. Everything
 * else — the protected-literal validator, the Composer write, the RPC shape — is
 * unchanged, so the two transports cannot drift apart in behaviour.
 *
 * Fail closed throughout. An unknown endpoint, a missing key, a non-2xx status,
 * an unreadable body and an unparseable answer are all distinct failures, and
 * none of them falls back to another endpoint, another model, or the CLI path.
 */

const PROTOCOLS: Readonly<Record<ApiProtocolId, ApiProtocol>> = {
  openai: openAiProtocol,
  anthropic: anthropicProtocol,
  gemini: geminiProtocol,
  cloudflare: cloudflareProtocol,
};

/** Names the variable and where it was looked for, never the value. */
function describeMissing(what: "key" | "account ID", name: string, endpointId: string, reason: ApiKeyLookupFailure): string {
  switch (reason) {
    case "no_key_name":
      return what === "key"
        ? `Endpoint "${endpointId}" has no key variable. Enter one, or set Key source to No key.`
        : `Endpoint "${endpointId}" has no account ID variable.`;
    case "missing_env":
      return `The environment variable "${name}" (${what}) is not set for the Paseo daemon. Paseo reads shell variables once, when it starts: if you added it since, quit and reopen Paseo.`;
    case "missing_secrets_file":
      return `secrets.json was not found in the secrets directory, so "${name}" (${what}) cannot be read.`;
    case "missing_secrets_entry":
      return `secrets.json has no value for "${name}" (${what}).`;
    case "unreadable_secrets":
      return `secrets.json exists but could not be read as { "apiKeys": { ... } }; fix the file before "${name}" can be looked up.`;
    case "invalid_secrets_dir":
      return "The secrets directory must be an absolute path or start with ~/.";
  }
}

type Credentials =
  | { readonly ok: true; readonly apiKey: string; readonly accountId: string }
  | { readonly ok: false; readonly code: "missing_api_key"; readonly message: string };

/** The key, and the account id when the protocol needs one, each from the endpoint's own source. */
async function resolveCredentials(
  endpoint: ApiEndpoint,
  secretsDir: string | null,
  env: NodeJS.ProcessEnv | undefined,
): Promise<Credentials> {
  const shared = { secretsDir, ...(env === undefined ? {} : { env }) };
  const key = await resolveApiKey({ keySource: endpoint.keySource, apiKeyEnv: endpoint.apiKeyEnv, ...shared });
  if (!key.ok) {
    return { ok: false, code: "missing_api_key", message: describeMissing("key", endpoint.apiKeyEnv.trim(), endpoint.id, key.reason) };
  }
  if (!protocolNeedsAccountId(endpoint.protocol)) return { ok: true, apiKey: key.key, accountId: "" };
  const account = await resolveApiKey({
    keySource: endpoint.keySource === "none" ? "env" : endpoint.keySource,
    apiKeyEnv: endpoint.accountIdVar,
    ...shared,
  });
  if (!account.ok) {
    return {
      ok: false,
      code: "missing_api_key",
      message: describeMissing("account ID", endpoint.accountIdVar.trim(), endpoint.id, account.reason),
    };
  }
  return { ok: true, apiKey: key.key, accountId: account.key };
}

export type ApiRewriteFailureCode =
  | "api_endpoint_unknown"
  | "missing_api_key"
  | "api_http_error"
  | "api_bad_response"
  | "timeout";

export interface ApiRewriteInput {
  readonly endpoint: ApiEndpoint;
  readonly model: string;
  readonly systemPrompt: string;
  readonly taskPrompt: string;
  readonly timeoutMs: number;
  /** Directory holding `secrets.json`; null means the default under `PASEO_HOME`. */
  readonly secretsDir: string | null;
}

export interface ApiRewriteDependencies {
  /** Test seam: replaces the HTTP call. */
  fetch?: typeof globalThis.fetch;
  /** Test seam: replaces the environment the key is read from. */
  env?: NodeJS.ProcessEnv;
}

export type ApiRewriteResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: ApiRewriteFailureCode; readonly message: string };

export type ApiTestResult =
  | { readonly ok: true; readonly models: readonly string[] }
  | { readonly ok: false; readonly code: ApiRewriteFailureCode; readonly message: string };

export function findProtocol(protocol: string): ApiProtocol | null {
  return Object.prototype.hasOwnProperty.call(PROTOCOLS, protocol)
    ? PROTOCOLS[protocol as ApiProtocolId]
    : null;
}

/**
 * Turns a non-2xx answer into a message safe to show a user.
 *
 * The provider's own error text is the most useful thing to surface, but it is
 * untrusted and can echo the request, so it is truncated and stripped of newlines
 * before it reaches a message or a log.
 */
function describeHttpError(status: number, body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ").slice(0, 300);
  return trimmed === ""
    ? `The endpoint answered HTTP ${status}.`
    : `The endpoint answered HTTP ${status}: ${trimmed}`;
}

/**
 * Tests one endpoint: resolves the key, lists its models, and reports either the
 * list or the exact reason there is none. Never throws, and never echoes a key.
 *
 * This is what the settings screen's test button calls, so a wrong base URL or a
 * missing key is discovered while the user is still on the settings screen
 * instead of on the next rewrite.
 */
export async function testApiEndpoint(
  input: {
    readonly endpoint: ApiEndpoint;
    readonly secretsDir: string | null;
    readonly timeoutMs: number;
  },
  dependencies: ApiRewriteDependencies = {},
): Promise<ApiTestResult> {
  const protocol = findProtocol(input.endpoint.protocol);
  if (protocol === null) {
    return {
      ok: false,
      code: "api_endpoint_unknown",
      message: `No protocol implementation for "${input.endpoint.protocol}".`,
    };
  }

  const credentials = await resolveCredentials(input.endpoint, input.secretsDir, dependencies.env);
  if (!credentials.ok) return credentials;

  const request = protocol.buildModelsRequest({
    baseUrl: input.endpoint.baseUrl,
    apiKey: credentials.apiKey,
    accountId: credentials.accountId,
  });
  const doFetch = dependencies.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  let response: Response;
  try {
    response = await doFetch(request.url, {
      method: "GET",
      headers: request.headers,
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      code: aborted ? "timeout" : "api_http_error",
      message: aborted
        ? "The endpoint did not answer in time."
        : `Could not reach the endpoint: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    return { ok: false, code: "api_http_error", message: describeHttpError(response.status, body) };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return {
      ok: false,
      code: "api_bad_response",
      message: "The endpoint answered with something that is not JSON.",
    };
  }
  // An empty list is not a failure: a local server may expose none, and the key
  // and URL still proved correct, which is the whole point of the test.
  return { ok: true, models: protocol.parseModelsResponse(payload) };
}

export async function runApiRewrite(
  input: ApiRewriteInput,
  dependencies: ApiRewriteDependencies = {},
): Promise<ApiRewriteResult> {
  const protocol = findProtocol(input.endpoint.protocol);
  if (protocol === null) {
    return {
      ok: false,
      code: "api_endpoint_unknown",
      message: `No protocol implementation for "${input.endpoint.protocol}".`,
    };
  }

  // Messages name the variable, never a value.
  const credentials = await resolveCredentials(input.endpoint, input.secretsDir, dependencies.env);
  if (!credentials.ok) return credentials;

  const request = protocol.buildRequest({
    baseUrl: input.endpoint.baseUrl,
    apiKey: credentials.apiKey,
    accountId: credentials.accountId,
    model: input.model,
    systemPrompt: input.systemPrompt,
    taskPrompt: input.taskPrompt,
  });

  const doFetch = dependencies.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  let response: Response;
  try {
    response = await doFetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      code: aborted ? "timeout" : "api_http_error",
      message: aborted
        ? "The rewrite timed out."
        : `Could not reach the endpoint: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    return { ok: false, code: "api_http_error", message: describeHttpError(response.status, body) };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return {
      ok: false,
      code: "api_bad_response",
      message: "The endpoint answered with something that is not JSON.",
    };
  }

  const text = protocol.parseResponse(payload);
  if (text === null || text.trim() === "") {
    return {
      ok: false,
      code: "api_bad_response",
      message: "The endpoint answered without any text to use.",
    };
  }
  return { ok: true, text };
}
