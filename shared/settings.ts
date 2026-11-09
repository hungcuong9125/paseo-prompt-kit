import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { actionPackSchema, actionOverridesSchema } from "./action-registry/schema.js";
import { apiEndpointSchema } from "./api-protocol.js";
import { CLI_FAMILY_IDS } from "./cli-families.js";
import { LANGUAGE_ID_PATTERN, SOURCE_LANGUAGE } from "./language-registry/schema.js";

/** Which model the CLI transport runs. The API transport ignores it. */
export const modelModeSchema = z.enum(["current", "dedicated"]);

/**
 * How the model is reached. `cli` spawns the provider's CLI and takes its model
 * from `modelMode`; `api` posts to `apiEndpointId` with `apiModel`, or to a
 * provider's mapped endpoint with that agent's own model.
 */
export const transportSchema = z.enum(["cli", "api"]);

/**
 * Rewrite budget bounds. `hostRpcCapMs` is the daemon's own 30 s plugin-RPC cap; a rewrite
 * stops at `runCapMs` so PromptKit reports its own timeout before the host drops the call.
 */
export const TIMEOUT_MS = {
  min: 1_000,
  max: 600_000,
  default: 25_000,
  runCapMs: 27_000,
  hostRpcCapMs: 30_000,
} as const;

/** The budget a rewrite actually runs with. */
export function effectiveTimeoutMs(timeoutMs: number): number {
  return Math.min(timeoutMs, TIMEOUT_MS.runCapMs);
}

/**
 * Host-scoped PromptKit settings. Every field has a default so `{}` parses and
 * an incomplete dedicated selection can never silently select another model.
 *
 * A settings document travels to the client, so no API key is ever stored here:
 * an endpoint carries the *name* of its key (`apiKeyEnv`) and the server resolves
 * the value. See `README.md`, "API keys".
 */
export const promptKitSettingsSchema = z.object({
  modelMode: modelModeSchema.default("current"),
  transport: transportSchema.default("cli"),
  dedicatedProvider: z.string().min(1).nullable().default(null),
  dedicatedModel: z.string().min(1).nullable().default(null),
  dedicatedThinkingOptionId: z.string().min(1).nullable().default(null),
  /**
   * Maps a Paseo provider id to the CLI family that runs it. A provider named
   * after its CLI (`pi`, `codex`), or whose id starts with that name, resolves
   * without an entry here. An entry is needed only for a provider whose id does
   * not mention its CLI, and an unknown id fails closed either way.
   */
  providerCli: z.record(z.string(), z.enum(CLI_FAMILY_IDS)).default({}),
  /** The API endpoints this host can reach. Key values are never stored here. */
  apiEndpoints: z.array(apiEndpointSchema).default([]),
  /** The endpoint `transport: "api"` uses for an agent whose provider is not mapped. */
  apiEndpointId: z.string().min(1).nullable().default(null),
  /** The model id sent to that endpoint. */
  apiModel: z.string().min(1).nullable().default(null),
  /**
   * Maps a Paseo provider id to an endpoint id, so an agent whose provider is
   * served by a direct API can rewrite over HTTP instead of paying a CLI cold
   * start. The counterpart of `providerCli`: that one says which CLI runs a
   * provider, this one says which endpoint serves it.
   */
  apiEndpointByProvider: z.record(z.string(), z.string().min(1)).default({}),
  /**
   * Directory holding `secrets.json` for every endpoint whose key source is `secrets_file`,
   * or null for `<PASEO_HOME>/plugin-settings/prompt-kit`. Absolute or `~/`-prefixed.
   */
  secretsDir: z.string().min(1).nullable().default(null),
  timeoutMs: z.number().int().min(TIMEOUT_MS.min).max(TIMEOUT_MS.max).default(TIMEOUT_MS.default),
  /** Writes per-rewrite detail lines (target, request, CLI or HTTP result) to the plugin log. */
  debugLog: z.boolean().default(false),
  /** Shows the PromptKit entry in the host's left sidebar; the entry opens the settings screen. */
  sidebarEntry: z.boolean().default(false),
  /**
   * The language PromptKit's own screens use. "auto" follows the device
   * locale; anything else is a language PromptKit ships catalogs for.
   */
  uiLanguage: z.enum(["auto", "en", "zh-CN"]).default("auto"),
  /**
   * When a mobile rewrite lands, the Composer keeps both versions side by
   * side (the rewrite on top, the original below a marker). Off: the Composer
   * shows only the rewritten text. What reaches the agent is always the
   * rewritten text either way.
   */
  composerIncludeOriginal: z.boolean().default(false),
  /**
   * Per-action user toggle, keyed by action id. An id absent here falls back to
   * the pack's `enabledByDefault`, so a newly added pack is usable without a
   * settings migration and a removed pack leaves no stale state behind.
   */
  actionEnabled: z.record(z.string(), z.boolean()).default({}),
  /** Actions the user wrote in Settings; same pack schema and rewrite path as the bundled ones. */
  customActions: z.array(actionPackSchema).default([]),
  actionOverrides: actionOverridesSchema.default({}),
  /** `SOURCE_LANGUAGE` or a loaded id from `shared/languages/`. */
  outputLanguage: z.string().regex(LANGUAGE_ID_PATTERN).default(SOURCE_LANGUAGE),
});

export type PromptKitSettings = z.output<typeof promptKitSettingsSchema>;

export const promptKitSettings = defineSettings({
  id: "prompt-kit",
  scope: "host",
  version: 1,
  schema: promptKitSettingsSchema,
});

export function isDedicatedSelectionComplete(settings: PromptKitSettings): boolean {
  return settings.dedicatedProvider !== null && settings.dedicatedModel !== null;
}
