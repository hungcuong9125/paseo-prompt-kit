import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { ACTION_ID_PATTERN } from "./action-registry/schema.js";
import { apiEndpointSchema } from "./api-protocol.js";
import { promptKitSettingsSchema } from "./settings.js";

export const rewriteErrorCodeSchema = z.enum([
  "invalid_model",
  "invalid_selection",
  "unknown_action",
  "timeout",
  "empty_output",
  "unsupported_provider",
  "spawn_failed",
  "missing_api_key",
  "api_endpoint_unknown",
  "api_http_error",
  "api_bad_response",
  "protected_literal_loss",
  "generation_failed",
]);

export const rewriteErrorSchema = z.object({
  code: rewriteErrorCodeSchema,
  message: z.string().min(1),
});

export const rewriteModelSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1).nullable(),
  thinkingOptionId: z.string().min(1).nullable(),
});

/**
 * Paseo 0.8.0's `registerSettings` returns void, so the daemon-side handler
 * cannot read its own settings document; the caller's persisted settings
 * snapshot travels with the request and the handler re-validates every field.
 */
export const rewriteRpc = defineRpc({
  name: "prompt-kit.rewrite",
  input: z.object({
    actionId: z.string().regex(ACTION_ID_PATTERN),
    /** Null for a draft Composer with no agent yet. */
    agentId: z.string().min(1).nullable(),
    workspaceId: z.string().min(1),
    originalPrompt: z.string().min(1).max(50_000),
    settings: promptKitSettingsSchema,
  }),
  output: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("ok"),
      rewrittenPrompt: z.string().min(1),
      model: rewriteModelSchema,
      durationMs: z.number().nonnegative(),
    }),
    z.object({
      status: z.literal("error"),
      error: rewriteErrorSchema,
    }),
  ]),
});

export const actionSummarySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  enabledByDefault: z.boolean(),
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
});

/**
 * The registry as loaded, with no settings applied. Which actions are enabled is
 * a client-side decision, so the same settings document never has to be read
 * twice and the RPC stays a pure function of the loaded packs.
 */
export const actionsListRpc = defineRpc({
  name: "prompt-kit.actions.list",
  input: z.object({}),
  output: z.object({
    actions: z.array(actionSummarySchema),
  }),
});

export const thinkingOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const providerModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  thinkingOptions: z.array(thinkingOptionSchema),
  defaultThinkingOptionId: z.string().min(1).nullable(),
});

export const providerCatalogEntrySchema = z.object({
  provider: z.string().min(1),
  label: z.string().min(1),
  available: z.boolean(),
  models: z.array(providerModelSchema),
});

export const providerCatalogRpc = defineRpc({
  name: "prompt-kit.providers",
  input: z.object({ cwd: z.string().min(1).optional() }),
  output: z.object({
    providers: z.array(providerCatalogEntrySchema),
  }),
});

/**
 * Checks one API endpoint from the settings screen: resolves its key, asks the
 * endpoint which models it offers, and reports the outcome.
 *
 * It exists so a wrong base URL, a missing key or an unreachable host is found on
 * the settings screen rather than on the next rewrite. The answer never carries a
 * key value: a failure names the variable, never the secret.
 */
export const apiTestRpc = defineRpc({
  name: "prompt-kit.api.test",
  input: z.object({
    endpoint: apiEndpointSchema,
    secretsDir: z.string().min(1).nullable(),
  }),
  output: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("ok"),
      models: z.array(z.string()),
    }),
    z.object({
      status: z.literal("error"),
      error: rewriteErrorSchema,
    }),
  ]),
});

const secretsResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok") }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

/**
 * Stores one secrets.json entry on the daemon (`value`), or removes it (`null`).
 * Write-only: no RPC ever returns a key value.
 */
export const secretsWriteRpc = defineRpc({
  name: "prompt-kit.secrets.write",
  input: z.object({
    secretsDir: z.string().min(1).nullable(),
    name: z.string().min(1).max(120),
    value: z.string().trim().min(1).max(4_096).nullable(),
  }),
  output: secretsResultSchema,
});

/** Whether secrets.json holds a value for `name`; the answer is a boolean, never the value. */
export const secretsStatusRpc = defineRpc({
  name: "prompt-kit.secrets.status",
  input: z.object({
    secretsDir: z.string().min(1).nullable(),
    name: z.string().min(1).max(120),
  }),
  output: z.discriminatedUnion("status", [
    z.object({ status: z.literal("ok"), stored: z.boolean() }),
    z.object({ status: z.literal("error"), message: z.string() }),
  ]),
});

export type RewriteInput = z.output<typeof rewriteRpc.input>;
export type RewriteOutput = z.output<typeof rewriteRpc.output>;
export type RewriteError = z.output<typeof rewriteErrorSchema>;
export type ActionSummary = z.output<typeof actionSummarySchema>;
export type ActionsListOutput = z.output<typeof actionsListRpc.output>;
export type ProviderCatalogOutput = z.output<typeof providerCatalogRpc.output>;
export type ApiTestInput = z.output<typeof apiTestRpc.input>;
export type ApiTestOutput = z.output<typeof apiTestRpc.output>;
