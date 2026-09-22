import { z } from "zod";

/**
 * The wire protocols PromptKit can speak directly, with no CLI in between.
 *
 * One entry per *protocol*, not per vendor: an endpoint is a base URL plus a key,
 * so OpenAI, OpenRouter, LiteLLM, vLLM and any internal gateway are all the
 * same `openai` entry with a different `baseUrl`. That is what keeps adding a
 * vendor a settings edit instead of a code change.
 */
export const API_PROTOCOL_IDS = ["openai", "anthropic", "gemini"] as const;

export type ApiProtocolId = (typeof API_PROTOCOL_IDS)[number];

export function isApiProtocolId(value: string): value is ApiProtocolId {
  return (API_PROTOCOL_IDS as readonly string[]).includes(value);
}

/** Where the server reads an endpoint's key. Exactly one source; no fallback between them. */
export const API_KEY_SOURCES = ["env", "secrets_file", "none"] as const;

export type ApiKeySource = (typeof API_KEY_SOURCES)[number];

/**
 * One reachable API. The key is named, never carried: the value is read on the
 * server from `keySource`, because a settings document travels to the client.
 */
export const apiEndpointSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "An endpoint id is lowercase alphanumeric with hyphens."),
  label: z.string().min(1).max(120),
  protocol: z.enum(API_PROTOCOL_IDS),
  /** Base URL without a trailing slash, e.g. `https://api.openai.com/v1`. */
  baseUrl: z.string().url(),
  /** `env`: a daemon environment variable; `secrets_file`: an entry in secrets.json; `none`: no key (local server). */
  keySource: z.enum(API_KEY_SOURCES).default("env"),
  /** Name of the variable or secrets.json entry holding the key. Never the key; unused when `keySource` is `none`. */
  apiKeyEnv: z.string().max(120).default(""),
  /** Models offered for this endpoint. Sent to the API unchanged. */
  models: z.array(z.string().min(1).max(200)).default([]),
});

export type ApiEndpoint = z.output<typeof apiEndpointSchema>;
