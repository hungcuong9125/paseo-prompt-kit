import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { promptActionIds } from "./actions.js";
import { promptKitSettingsSchema } from "./settings.js";

export const rewriteErrorCodeSchema = z.enum([
  "invalid_model",
  "invalid_selection",
  "timeout",
  "empty_output",
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
    actionId: z.enum(promptActionIds),
    agentId: z.string().min(1),
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

export type RewriteInput = z.output<typeof rewriteRpc.input>;
export type RewriteOutput = z.output<typeof rewriteRpc.output>;
export type RewriteError = z.output<typeof rewriteErrorSchema>;
export type ProviderCatalogOutput = z.output<typeof providerCatalogRpc.output>;
