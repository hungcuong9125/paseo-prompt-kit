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

  // 多 run 并存：另一 surface 的判定不得挤掉本 run 未读取的判定（可用性），
  // 每个 run 的判定按 requestId 独立可读。
  it("keeps the last KEEP_PER_AGENT runs per agent, each readable by its requestId", () => {
    forgetRewriteVerdicts();
    recordRewriteVerdict("agent-1", "req-1", { ok: true, text: "first" });
    recordRewriteVerdict("agent-1", "req-2", { ok: true, text: "second" });
    recordRewriteVerdict("agent-1", "req-3", { ok: true, text: "third" });
    expect(readRewriteVerdict("agent-1", "req-2")).toEqual({
      requestId: "req-2",
      ok: true,
      text: "second",
    });
    expect(readRewriteVerdict("agent-1", "req-3")).toEqual({
      requestId: "req-3",
      ok: true,
      text: "third",
    });
    // …until a run ages out of the per-agent window.
    recordRewriteVerdict("agent-1", "req-4", { ok: true, text: "fourth" });
    expect(readRewriteVerdict("agent-1", "req-1")).toEqual({ pending: true });
    expect(readRewriteVerdict("agent-1", "req-4")).toEqual({
      requestId: "req-4",
      ok: true,
      text: "fourth",
    });
  });
});
