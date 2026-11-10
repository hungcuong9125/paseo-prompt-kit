import { describe, expect, it } from "vitest";
import type { CodexConnection, CodexNotification } from "../../server/transports/cli/codex-app-server.js";
import { createCodexSessions, type CodexRewriteInput } from "../../server/transports/cli/codex-sessions.js";

interface Call {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

type TurnScript = (threadId: string, turnId: string, emit: (method: string, params: Record<string, unknown>) => void) => void;

/** A fake `codex app-server`: answers requests and plays each turn through `script`. */
function fakeServer(options: { script?: TurnScript; failInitialize?: boolean } = {}) {
  const connections: { calls: Call[]; closed: boolean; exit: (reason: string) => void }[] = [];
  const connect = (): CodexConnection => {
    const calls: Call[] = [];
    const listeners = new Set<(notification: CodexNotification) => void>();
    const exitListeners: ((reason: string) => void)[] = [];
    let threads = 0;
    let turns = 0;
    const record = { calls, closed: false, exit: (reason: string) => exitListeners.forEach((listener) => listener(reason)) };
    connections.push(record);
    const emit = (method: string, params: Record<string, unknown>) => {
      for (const listener of [...listeners]) listener({ method, params });
    };
    const script: TurnScript =
      options.script ??
      ((threadId, turnId) => {
        emit("item/completed", { threadId, turnId, item: { type: "agentMessage", text: `answer ${turnId}` } });
        emit("turn/completed", { threadId, turn: { id: turnId, status: "completed", error: null } });
      });
    return {
      async request(method, params) {
        calls.push({ method, params });
        if (method === "initialize") {
          if (options.failInitialize) throw new Error("codex: not logged in");
          return {};
        }
        if (method === "thread/start") return { thread: { id: `t${++threads}` } };
        if (method === "turn/start") {
          const turnId = `u${++turns}`;
          setTimeout(() => script(params.threadId as string, turnId, emit), 1);
          return { turn: { id: turnId } };
        }
        return {};
      },
      notify: () => undefined,
      onNotification(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onExit(listener) {
        exitListeners.push(listener);
      },
      pid: 1,
      close() {
        record.closed = true;
      },
    };
  };
  return { connect, connections };
}

const INPUT: CodexRewriteInput = { model: "gpt-x", effort: "low", systemPrompt: "RULES", taskPrompt: "<draft>a</draft>", timeoutMs: 2_000 };

function methods(calls: Call[], method: string): Call[] {
  return calls.filter((call) => call.method === method);
}

describe("codex sessions", () => {
  it("reuses the server but isolates successive drafts in distinct threads", async () => {
    const server = fakeServer();
    const sessions = createCodexSessions(server.connect);
    expect(await sessions.run(INPUT)).toEqual({ ok: true, text: "answer u1" });
    expect(await sessions.run({ ...INPUT, taskPrompt: "<draft>b</draft>" })).toEqual({ ok: true, text: "answer u2" });

    expect(server.connections).toHaveLength(1);
    const calls = server.connections[0]!.calls;
    expect(methods(calls, "initialize")).toHaveLength(1);
    expect(methods(calls, "thread/start")).toHaveLength(2);
    for (const call of methods(calls, "thread/start")) {
      expect(call.params).toMatchObject({ model: "gpt-x", sandbox: "read-only", approvalPolicy: "never", developerInstructions: "RULES", ephemeral: true });
    }
    expect(methods(calls, "turn/start").map((call) => call.params)).toEqual([
      { threadId: "t1", input: [{ type: "text", text: "<draft>a</draft>", text_elements: [] }], effort: "low" },
      { threadId: "t2", input: [{ type: "text", text: "<draft>b</draft>", text_elements: [] }], effort: "low" },
    ]);
    sessions.close();
  });

  it("gives other rules or another model their own thread", async () => {
    const server = fakeServer();
    const sessions = createCodexSessions(server.connect);
    await sessions.run(INPUT);
    await sessions.run({ ...INPUT, systemPrompt: "OTHER RULES" });
    await sessions.run({ ...INPUT, model: "" });
    const starts = methods(server.connections[0]!.calls, "thread/start");
    expect(starts).toHaveLength(3);
    expect(starts[2]!.params).not.toHaveProperty("model");
    sessions.close();
  });

  it("unsubscribes every disposable thread after its rewrite", async () => {
    const server = fakeServer();
    const sessions = createCodexSessions(server.connect);
    await sessions.run(INPUT);
    await sessions.run(INPUT);
    const calls = server.connections[0]!.calls;
    expect(methods(calls, "thread/start")).toHaveLength(2);
    expect(methods(calls, "thread/unsubscribe").map((call) => call.params)).toEqual([{ threadId: "t1" }, { threadId: "t2" }]);
    sessions.close();
  });

  it("never shares a busy thread between concurrent rewrites", async () => {
    const server = fakeServer();
    const sessions = createCodexSessions(server.connect);
    const results = await Promise.all([sessions.run(INPUT), sessions.run(INPUT)]);
    expect(results.every((result) => result.ok)).toBe(true);
    const threads = methods(server.connections[0]!.calls, "turn/start").map((call) => call.params.threadId);
    expect(new Set(threads).size).toBe(2);
    sessions.close();
  });

  it("closes the server so a timed-out turn cannot continue", async () => {
    const server = fakeServer({ script: () => undefined });
    const sessions = createCodexSessions(server.connect);
    const result = await sessions.run({ ...INPUT, timeoutMs: 20 });
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    if (result.ok) throw new Error("expected failure");
    expect(result.message).toContain('"codex" did not answer within');
    sessions.close();
    // Under load the deadline can fire before the server ever connects; either
    // way no connection may survive the close with its scratch left open.
    for (const connection of server.connections) expect(connection.closed).toBe(true);
  });

  it("refuses a failed turn without exposing provider content", async () => {
    const provider = JSON.stringify({ error: { message: "You've hit your usage limit." } });
    const server = fakeServer({
      script: (threadId, turnId, emit) => {
        emit("error", { threadId, turnId, willRetry: true, error: { message: "retrying" } });
        emit("turn/completed", { threadId, turn: { id: turnId, status: "failed", error: { message: provider } } });
      },
    });
    const sessions = createCodexSessions(server.connect);
    expect(await sessions.run(INPUT)).toEqual({
      ok: false,
      code: "generation_failed",
      message: 'The rewrite CLI "codex" did not complete the rewrite.',
    });
    await sessions.run(INPUT);
    expect(methods(server.connections[0]!.calls, "thread/start")).toHaveLength(2);
    sessions.close();
  });

  it("reports a turn that completed without an answer", async () => {
    const server = fakeServer({
      script: (threadId, turnId, emit) => emit("turn/completed", { threadId, turn: { id: turnId, status: "completed", error: null } }),
    });
    const sessions = createCodexSessions(server.connect);
    expect(await sessions.run(INPUT)).toMatchObject({ ok: false, code: "empty_output" });
    sessions.close();
  });

  it("fails a rewrite whose server died, then starts a fresh server", async () => {
    const server = fakeServer({ script: () => server.connections[0]!.exit("codex app-server exited with code 1: auth expired") });
    const sessions = createCodexSessions(server.connect);
    expect(await sessions.run(INPUT)).toEqual({
      ok: false,
      code: "generation_failed",
      message: 'The rewrite CLI "codex" did not complete the rewrite.',
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await sessions.run({ ...INPUT, timeoutMs: 20 });
    expect(server.connections).toHaveLength(2);
    expect(server.connections[0]!.closed).toBe(true);
    sessions.close();
  });

  it("reports a server that could not initialize and tries again on the next rewrite", async () => {
    const server = fakeServer({ failInitialize: true });
    const sessions = createCodexSessions(server.connect);
    expect(await sessions.run(INPUT)).toEqual({ ok: false, code: "spawn_failed", message: "The codex server could not initialize." });
    await sessions.run(INPUT);
    expect(server.connections).toHaveLength(2);
    expect(server.connections.every((connection) => connection.closed)).toBe(true);
    sessions.close();
  });

  it("closes the server when the plugin stops", async () => {
    const server = fakeServer();
    const sessions = createCodexSessions(server.connect);
    await sessions.run(INPUT);
    sessions.close();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(server.connections[0]!.closed).toBe(true);
  });
});
