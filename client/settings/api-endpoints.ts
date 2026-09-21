import type { ApiEndpoint, ApiProtocolId } from "../../shared/api-protocol.js";

/**
 * Endpoint presets, so the common cases are one click instead of a form.
 *
 * A preset fills the id, label, protocol and base URL. The key name is left at the
 * protocol's usual variable so the field is already correct in the common case,
 * and the user can change it. Presets carry no key and no model: those are the
 * user's, and a preset that guessed a model would be wrong within a month.
 */
export interface EndpointPreset {
  readonly id: string;
  readonly label: string;
  readonly protocol: ApiProtocolId;
  readonly baseUrl: string;
  readonly apiKeyEnv: string;
  /** A short note shown next to the preset in the picker. */
  readonly note: string;
}

export const ENDPOINT_PRESETS: readonly EndpointPreset[] = [
  {
    id: "groq",
    label: "Groq",
    protocol: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    note: "OpenAI-compatible, very fast",
  },
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    note: "Chat Completions",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    note: "Messages API",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKeyEnv: "GEMINI_API_KEY",
    note: "AI Studio",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    note: "Many providers, one key",
  },
  {
    id: "local",
    label: "Local server",
    protocol: "openai",
    baseUrl: "http://127.0.0.1:1234/v1",
    apiKeyEnv: "",
    note: "LM Studio, vLLM, llama.cpp — no key",
  },
];

export const PROTOCOL_OPTIONS = [
  { label: "OpenAI-compatible", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Google Gemini", value: "gemini" },
] as const;

/** A blank endpoint, used by "Add endpoint" before a preset is chosen. */
export function blankEndpoint(): ApiEndpoint {
  return {
    id: "",
    label: "",
    protocol: "openai",
    baseUrl: "https://",
    apiKeyEnv: "",
    models: [],
  };
}

/**
 * A URL-safe id derived from a label, because the schema requires
 * `^[a-z0-9][a-z0-9-]*$` and a user types a display name.
 */
export function slugifyId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function endpointFromPreset(preset: EndpointPreset): ApiEndpoint {
  return {
    id: preset.id,
    label: preset.label,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    apiKeyEnv: preset.apiKeyEnv,
    models: [],
  };
}

/**
 * Why an endpoint cannot be saved yet, or null when it can.
 *
 * It runs before `save`, so the user gets a sentence instead of a schema error,
 * and an endpoint that cannot work is never written to the settings document.
 */
export function validateEndpoint(
  endpoint: ApiEndpoint,
  all: readonly ApiEndpoint[],
  editingId: string | null,
): string | null {
  if (endpoint.id.trim() === "") return "An id is required.";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(endpoint.id)) {
    return "The id must be lowercase letters, digits and hyphens, starting with a letter or digit.";
  }
  if (all.some((candidate) => candidate.id === endpoint.id && candidate.id !== editingId)) {
    return `Another endpoint already uses the id "${endpoint.id}".`;
  }
  if (endpoint.label.trim() === "") return "A label is required.";
  if (!/^https?:\/\/.+/.test(endpoint.baseUrl.trim())) {
    return "The base URL must start with http:// or https://.";
  }
  return null;
}
