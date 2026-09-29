import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "../eval/cases.js";
import { failures, rewriteLive } from "../eval/run-case.js";

/**
 * Behavioural eval: each case is a draft with checks on what a real model returns.
 * Opt-in because it spends model calls; use a cheap model (DLF-013).
 *
 *   PASEO_LIVE=1 PASEO_EVAL_PROTOCOL=openai PASEO_EVAL_BASE_URL=https://... \
 *   PASEO_EVAL_MODEL=<model> PASEO_EVAL_KEY_ENV=<NAME_OF_KEY_VARIABLE> \
 *   npx vitest run tests/integration/rewrite-eval.test.ts
 */
const env = process.env;
const protocol = env.PASEO_EVAL_PROTOCOL;
const baseUrl = env.PASEO_EVAL_BASE_URL;
const model = env.PASEO_EVAL_MODEL;
const keyEnv = env.PASEO_EVAL_KEY_ENV;
const isProtocol = (value: string | undefined): value is "openai" | "anthropic" | "gemini" | "cloudflare" =>
  value === "openai" || value === "anthropic" || value === "gemini" || value === "cloudflare";

const unavailable =
  env.PASEO_LIVE !== "1"
    ? "PASEO_LIVE is not 1; the eval is opt-in"
    : !isProtocol(protocol) || !baseUrl || !model || !keyEnv
      ? "PASEO_EVAL_PROTOCOL, PASEO_EVAL_BASE_URL, PASEO_EVAL_MODEL and PASEO_EVAL_KEY_ENV must all be set"
      : !env[keyEnv]
        ? `${keyEnv} is empty`
        : null;

describe("live rewrite eval", () => {
  for (const entry of EVAL_CASES) {
    it(`${entry.id}`, async (context) => {
      if (unavailable !== null || !isProtocol(protocol) || !baseUrl || !model || !keyEnv) {
        context.skip(unavailable ?? "eval endpoint is not configured");
        return;
      }
      const result = await rewriteLive(entry, { protocol, baseUrl, keyEnv, model });
      expect(result.ok, result.ok ? "" : result.message).toBe(true);
      if (!result.ok) return;
      console.log(`[eval ${entry.id}] ${result.text.replace(/\s+/g, " ")}`);
      expect(failures(entry, result.text)).toEqual([]);
    }, 60_000);
  }
});
