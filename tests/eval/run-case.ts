import { buildSystemPrompt } from "../../shared/action-registry/rewrite-contract.js";
import { resolveAction } from "../../shared/action-registry/registry.js";
import { resolveLanguage } from "../../shared/language-registry/registry.js";
import { buildTaskPrompt } from "../../shared/action-registry/wrapper.js";
import { validateRewriteOutput } from "../../server/rewrite-engine/output-validator.js";
import { runRewrite } from "../../server/rewrite-engine/engine.js";
import { createRewriteHarness, settings } from "../server/harness.js";
import { SAMPLE_PACKS, SHARED_CHECKS, type EvalCase } from "./cases.js";

/** Every failed check of one output, empty when the output holds up. */
export function failures(evalCase: EvalCase, output: string): string[] {
  const validated = validateRewriteOutput({ originalPrompt: evalCase.draft, output });
  const failed = validated.ok ? [] : [`validator: ${validated.error.message}`];
  for (const check of [...SHARED_CHECKS, ...evalCase.checks]) {
    if (!check.holds(output, evalCase.draft)) failed.push(check.name);
  }
  return failed;
}

/** One live rewrite through the real engine and an API endpoint, returning the model's text. */
export async function rewriteLive(
  evalCase: EvalCase,
  endpoint: { protocol: "openai" | "anthropic" | "gemini" | "cloudflare"; baseUrl: string; keyEnv: string; model: string },
  seams: { fetch?: typeof globalThis.fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const action = resolveAction(evalCase.actionId, SAMPLE_PACKS);
  if (action === null) throw new Error(`eval case ${evalCase.id} names an unknown action`);
  const language = evalCase.outputLanguage === undefined ? null : resolveLanguage(evalCase.outputLanguage);
  if (language === undefined) throw new Error(`eval case ${evalCase.id} names an unknown output language`);
  const output = await runRewrite(
    createRewriteHarness({}).paseo,
    {
      agentId: null,
      workspaceId: "eval",
      systemPrompt: buildSystemPrompt(action),
      originalPrompt: evalCase.draft,
      taskPrompt: buildTaskPrompt(action, evalCase.draft, language?.instruction ?? null),
    },
    {
      ...(seams.fetch === undefined ? {} : { fetch: seams.fetch }),
      ...(seams.env === undefined ? {} : { env: seams.env }),
      settings: await settings({
        transport: "api",
        apiEndpointId: "eval",
        apiModel: endpoint.model,
        apiEndpoints: [
          {
            id: "eval",
            label: "Eval endpoint",
            protocol: endpoint.protocol,
            baseUrl: endpoint.baseUrl,
            keySource: "env",
            apiKeyEnv: endpoint.keyEnv,
            accountIdVar: "",
            models: [endpoint.model],
          },
        ],
      }),
    },
  );
  return output.status === "ok"
    ? { ok: true, text: output.rewrittenPrompt }
    : { ok: false, message: `${output.error.code}: ${output.error.message}` };
}
