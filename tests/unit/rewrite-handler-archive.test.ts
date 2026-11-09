import { describe, expect, it } from "vitest";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { promptKitSettingsSchema } from "../../shared/settings.js";
import { createRewriteHandler } from "../../server/rewrite-engine/handler.js";
import { forgetRewriteVerdicts, readRewriteVerdict } from "../../server/rewrite-results.js";

/** N3 regression: the handler's pre-validation refusals return before the
 *  engine runs — they must still reach the verdict archive, or a client whose
 *  `rewrite` response was lost can never poll the real reason and waits out
 *  the full budget for a generic timeout instead. */
describe("rewrite handler verdict archive", () => {
  const context = { paseo: {} } as unknown as PluginHandlerContext;

  function input(overrides: Record<string, unknown>) {
    return {
      requestId: "req-test-12345678",
      actionId: "general",
      agentId: "agent-1",
      workspaceId: "ws-1",
      originalPrompt: "x",
      settings: promptKitSettingsSchema.parse({}),
      ...overrides,
    };
  }

  it("archives an unknown-action refusal", async () => {
    forgetRewriteVerdicts();
    const handle = createRewriteHandler();
    const output = await handle(input({ actionId: "no-such-action" }), context);
    expect(output.status).toBe("error");
    const verdict = readRewriteVerdict("agent-1", "req-test-12345678");
    if ("pending" in verdict) throw new Error("expected an archived verdict");
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("unknown_action");
  });

  it("archives a disabled-action refusal", async () => {
    forgetRewriteVerdicts();
    const handle = createRewriteHandler();
    const settings = promptKitSettingsSchema.parse({ actionEnabled: { general: false } });
    const output = await handle(input({ settings }), context);
    expect(output.status).toBe("error");
    const verdict = readRewriteVerdict("agent-1", "req-test-12345678");
    if ("pending" in verdict) throw new Error("expected an archived verdict");
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("unknown_action");
    expect(verdict.text).toContain("disabled");
  });

  it("archives an unknown-language refusal", async () => {
    forgetRewriteVerdicts();
    const handle = createRewriteHandler();
    const settings = promptKitSettingsSchema.parse({ outputLanguage: "no-such-lang" });
    const output = await handle(input({ settings }), context);
    expect(output.status).toBe("error");
    const verdict = readRewriteVerdict("agent-1", "req-test-12345678");
    if ("pending" in verdict) throw new Error("expected an archived verdict");
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe("invalid_selection");
  });

  it("archives nothing when the rewrite has no agent to key on", async () => {
    forgetRewriteVerdicts();
    const handle = createRewriteHandler();
    const output = await handle(input({ actionId: "no-such-action", agentId: null }), context);
    expect(output.status).toBe("error");
    expect(readRewriteVerdict("agent-1", "req-test-12345678")).toEqual({ pending: true });
  });
});
