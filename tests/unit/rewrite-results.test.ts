import { describe, expect, it } from "vitest";
import { forgetRewriteVerdicts, readRewriteVerdict, recordRewriteVerdict } from "../../server/rewrite-results.js";

describe("rewrite verdicts", () => {
  it("reports pending until the polled run's own verdict exists", () => {
    forgetRewriteVerdicts();
    expect(readRewriteVerdict("agent-1", "req-aaaa-1111")).toEqual({ pending: true });
    recordRewriteVerdict("agent-1", "req-aaaa-1111", { ok: true, text: "rewritten" });
    expect(readRewriteVerdict("agent-1", "req-aaaa-1111")).toEqual({
      requestId: "req-aaaa-1111",
      ok: true,
      text: "rewritten",
    });
  });

  it("never delivers a verdict from a different run of the same agent", () => {
    forgetRewriteVerdicts();
    recordRewriteVerdict("agent-1", "req-aaaa-1111", { ok: true, text: "first run" });
    // Another surface/device rewriting the same agent must not leak here.
    expect(readRewriteVerdict("agent-1", "req-bbbb-2222")).toEqual({ pending: true });
  });

  it("keeps verdicts per agent and carries the error code for localization", () => {
    forgetRewriteVerdicts();
    recordRewriteVerdict("agent-1", "req-aaaa-1111", { ok: true, text: "a" });
    recordRewriteVerdict("agent-2", "req-bbbb-2222", { ok: false, text: "CLI not installed", code: "spawn_failed" });
    expect(readRewriteVerdict("agent-1", "req-aaaa-1111")).toEqual({
      requestId: "req-aaaa-1111",
      ok: true,
      text: "a",
    });
    expect(readRewriteVerdict("agent-2", "req-bbbb-2222")).toEqual({
      requestId: "req-bbbb-2222",
      ok: false,
      text: "CLI not installed",
      code: "spawn_failed",
    });
  });

  it("keeps only the latest verdict per agent", () => {
    forgetRewriteVerdicts();
    recordRewriteVerdict("agent-1", "req-aaaa-1111", { ok: true, text: "first" });
    recordRewriteVerdict("agent-1", "req-bbbb-2222", { ok: true, text: "second" });
    const verdict = readRewriteVerdict("agent-1", "req-bbbb-2222");
    if ("pending" in verdict) throw new Error("expected a verdict");
    expect(verdict.text).toBe("second");
    // The superseded run reads as pending, not as a replay.
    expect(readRewriteVerdict("agent-1", "req-aaaa-1111")).toEqual({ pending: true });
  });
});
