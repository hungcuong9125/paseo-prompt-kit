import { protocolNeedsAccountId, type ApiEndpoint, type ApiKeySource, type ApiProtocolId } from "../../shared/api-protocol.js";

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
  readonly keySource: ApiKeySource;
  readonly apiKeyEnv: string;
  /** Variable holding the account id; empty unless the protocol needs one. */
  readonly accountIdVar: string;
  /** A short note shown next to the preset in the picker. */
  readonly note: string;
}

export const ENDPOINT_PRESETS: readonly EndpointPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    keySource: "env",
    apiKeyEnv: "OPENAI_API_KEY",
    accountIdVar: "",
    note: "Chat Completions",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    keySource: "env",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    accountIdVar: "",
    note: "Messages API",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    keySource: "env",
    apiKeyEnv: "GEMINI_API_KEY",
    accountIdVar: "",
    note: "AI Studio",
  },
  {
    id: "groq",
    label: "Groq",
    protocol: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    keySource: "env",
    apiKeyEnv: "GROQ_API_KEY",
    accountIdVar: "",
    note: "OpenAI-compatible, very fast",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keySource: "env",
    apiKeyEnv: "OPENROUTER_API_KEY",
    accountIdVar: "",
    note: "Many providers, one key",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    protocol: "cloudflare",
    baseUrl: "https://api.cloudflare.com/client/v4",
    keySource: "env",
    apiKeyEnv: "CLOUDFLARE_AUTH_TOKEN",
    accountIdVar: "CLAUDFLARE_ACCOUNT_ID",
    note: "Workers AI models",
  },
  {
    id: "local",
    label: "Local server",
    protocol: "openai",
    baseUrl: "http://127.0.0.1:1234/v1",
    keySource: "none",
    apiKeyEnv: "",
    accountIdVar: "",
    note: "LM Studio, vLLM, llama.cpp — no key",
  },
];

export const KEY_SOURCE_OPTIONS = [
  { label: "Environment variable", value: "env" },
  { label: "secrets.json", value: "secrets_file" },
  { label: "No key", value: "none" },
] as const;

/** A secrets directory the daemon can resolve: absolute, or under `~/`. */
export function isUsableSecretsDir(value: string): boolean {
  const text = value.trim();
  return text === "~" || text.startsWith("~/") || text.startsWith("/") || /^[A-Za-z]:[\\/]/.test(text);
}

/** Model id shown as a hint in the Model field, per protocol. */
export const MODEL_PLACEHOLDER: Readonly<Record<ApiProtocolId, string>> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash-lite",
  cloudflare: "@cf/meta/llama-3.1-8b-instruct-fp8",
};

export const PROTOCOL_OPTIONS = [
  { label: "OpenAI-compatible", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Google Gemini", value: "gemini" },
  { label: "Cloudflare Workers AI", value: "cloudflare" },
] as const;

export function endpointFromPreset(preset: EndpointPreset): ApiEndpoint {
  return {
    id: preset.id,
    label: preset.label,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    keySource: preset.keySource,
    apiKeyEnv: preset.apiKeyEnv,
    accountIdVar: preset.accountIdVar,
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
  if (protocolNeedsAccountId(endpoint.protocol) && endpoint.accountIdVar.trim() === "") {
    return "Enter the account ID variable.";
  }
  if (endpoint.keySource !== "none" && endpoint.apiKeyEnv.trim() === "") {
    return "Enter the key variable, or set Key source to No key.";
  }
  return null;
}
