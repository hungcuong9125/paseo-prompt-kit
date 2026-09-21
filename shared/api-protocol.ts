import { z } from "zod";

/**
 * The wire protocols PromptKit can speak directly, with no CLI in between.
 *
 * One entry per *protocol*, not per vendor: an endpoint is a base URL plus a key,
 * so Groq, OpenAI, OpenRouter, LiteLLM, vLLM and any internal gateway are all the
 * same `openai` entry with a different `baseUrl`. That is what keeps adding a
 * vendor a settings edit instead of a code change.
 */
export const API_PROTOCOL_IDS = ["openai", "anthropic", "gemini"] as const;

export type ApiProtocolId = (typeof API_PROTOCOL_IDS)[number];

export function isApiProtocolId(value: string): value is ApiProtocolId {
  return (API_PROTOCOL_IDS as readonly string[]).includes(value);
}

/**
 * One reachable API. The key is named, never carried: `apiKeyEnv` is the name of
 * an environment variable or an entry in `secrets.json`, and the value is read on
 * the server only. A settings document travels to the client, so a key stored
 * here would leave the machine.
 */
export const apiEndpointSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "An endpoint id is lowercase alphanumeric with hyphens."),
  label: z.string().min(1).max(120),
  protocol: z.enum(API_PROTOCOL_IDS),
  /** Base URL without a trailing slash, e.g. `https://api.groq.com/openai/v1`. */
  baseUrl: z.string().url(),
  /**
   * Name of the variable or `secrets.json` entry holding the key. Never the key.
   * Empty means the endpoint needs no key, which is valid for a local server.
   */
  apiKeyEnv: z.string().max(120).default(""),
  /** Models offered for this endpoint. Sent to the API unchanged. */
  models: z.array(z.string().min(1).max(200)).default([]),
});

export type ApiEndpoint = z.output<typeof apiEndpointSchema>;
