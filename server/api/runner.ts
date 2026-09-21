import type { ApiEndpoint, ApiProtocolId } from "../../shared/api-protocol.js";
import { anthropicProtocol } from "./anthropic.js";
import { geminiProtocol } from "./gemini.js";
import { resolveApiKey } from "./key.js";
import { openAiProtocol } from "./openai.js";
import type { ApiProtocol } from "./protocol.js";

/**
 * The rewrite path that talks to an API directly.
 *
 * It is the counterpart of `server/cli/runner.ts` and shares its contract: given
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
};

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

  const key = await resolveApiKey({
    apiKeyEnv: input.endpoint.apiKeyEnv,
    secretsDir: input.secretsDir,
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
  });
  if (!key.ok) {
    // The message names the variable, never a value: a key must not reach a log,
    // an error string, or the client that renders the toast.
    const name = input.endpoint.apiKeyEnv.trim();
    return {
      ok: false,
      code: "missing_api_key",
      message:
        name === ""
          ? `Endpoint "${input.endpoint.id}" has no key configured.`
          : `No value for "${name}". Set the environment variable or add it to secrets.json.`,
    };
  }

  const request = protocol.buildRequest({
    baseUrl: input.endpoint.baseUrl,
    apiKey: key.key,
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
