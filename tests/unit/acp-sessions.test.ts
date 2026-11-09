import { describe, expect, it } from "vitest";
import type { AcpConnection, AcpNotification } from "../../server/transports/cli/acp-connection.js";
import { createAcpSessions, type AcpRewriteInput } from "../../server/transports/cli/acp-sessions.js";
import type { AcpConnector } from "../../server/transports/cli/acp-connection.js";

interface Call {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

type SessionScript = (sessionId: string, emit: (method: string, params: Record<string, unknown>) => void) => void;

/** A fake ACP agent: answers requests and plays each session through `script`. */
function fakeAgent(
  options: {
    script?: SessionScript;
    failInitialize?: boolean;
    protocolVersion?: number;
    stopReason?: string;
    hang?: boolean;
  } = {},
) {
  const connections: {
    calls: Call[];
    closed: boolean;
    exit: (reason: string) => void;
    ask: (method: string, params: Record<string, unknown>) => unknown;
  }[] = [];
  const connect: AcpConnector = () => {
    const calls: Call[] = [];
    const listeners = new Set<(notification: AcpNotification) => void>();
    const exitListeners: ((reason: string) => void)[] = [];
    let agentRequest: ((method: string, params: Record<string, unknown>) => unknown) | null = null;
    let sessions = 0;
    const record = {
      calls,
      closed: false,
      exit: (reason: string) => exitListeners.forEach((listener) => listener(reason)),
      ask: (method: string, params: Record<string, unknown>) => agentRequest?.(method, params),
    };
    connections.push(record);
    const emit = (method: string, params: Record<string, unknown>) => {
      for (const listener of [...listeners]) listener({ method, params });
    };
    const script: SessionScript =
      options.script ??
      ((sessionId) => {
        emit("session/update", { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "OK" } } });
        emit("session/update", { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " then more" } } });
        emit("session/update", { sessionId, update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking" } } });
      });
    return {
      async request(method, params) {
        calls.push({ method, params });
        if (method === "initialize") {
          if (options.failInitialize) throw new Error("cline: not logged in");
          return { protocolVersion: options.protocolVersion ?? 1 };
        }
        if (method === "session/new") return { sessionId: `s${++sessions}` };
        if (method === "session/prompt") {
          const sessionId = params.sessionId as string;
          script(sessionId, emit);
          if (options.hang) return new Promise<Record<string, unknown>>(() => undefined);
          // The protocol streams updates during the turn, before the response.
          return { stopReason: options.stopReason ?? "end_turn" };
        }
        return {};
      },
      notify: () => undefined,
      onNotification(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onAgentRequest(handler) {
        agentRequest = handler;
      },
      onExit(listener) {
        exitListeners.push(listener);
      },
      pid: 1,
      close() {
        record.closed = true;
      },
    } satisfies AcpConnection;
  };
  return { connect, connections };
}

const INPUT: AcpRewriteInput = { systemPrompt: "RULES", taskPrompt: "<draft>a</draft>", timeoutMs: 2_000 };

function methods(calls: Call[], method: string): Call[] {
  return calls.filter((call) => call.method === method);
}

describe("acp sessions", () => {
  it("assembles streamed chunks, ignores thought, and reuses the process with fresh sessions", async () => {
    const agent = fakeAgent();
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    expect(await sessions.run(INPUT)).toEqual({ ok: true, text: "OK then more" });
    expect(await sessions.run({ ...INPUT, taskPrompt: "<draft>b</draft>" })).toEqual({ ok: true, text: "OK then more" });
    expect(methods(agent.connections[0]!.calls, "initialize")).toHaveLength(1);
    const prompts = methods(agent.connections[0]!.calls, "session/prompt");
    expect(prompts).toHaveLength(2);
    expect(prompts[0]!.params.sessionId).not.toBe(prompts[1]!.params.sessionId);
  });

  // ACP has no system-prompt channel: the contract must lead the prompt text.
  it("prepends the rewrite contract to the prompt the agent receives", async () => {
    const agent = fakeAgent();
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    await sessions.run(INPUT);
    const prompt = methods(agent.connections[0]!.calls, "session/prompt")[0]!.params;
    const blocks = prompt.prompt as { type: string; text: string }[];
    expect(blocks[0]).toEqual({ type: "text", text: "RULES\n\n<draft>a</draft>" });
  });

  it("advertises no client capabilities", async () => {
    const agent = fakeAgent();
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    await sessions.run(INPUT);
    expect(methods(agent.connections[0]!.calls, "initialize")[0]!.params.clientCapabilities).toEqual({});
  });

  // A rewrite grants nothing: a reject option is selected when offered, else cancelled.
  it("denies permission requests by selecting a reject option", async () => {
    const agent = fakeAgent();
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    await sessions.run(INPUT);
    const connection = agent.connections[0]!;
    expect(
      connection.ask("session/request_permission", {
        options: [
          { optionId: "allow", kind: "allow_once" },
          { optionId: "deny", kind: "reject_once" },
        ],
      }),
    ).toEqual({ outcome: { outcome: "selected", optionId: "deny" } });
    expect(
      connection.ask("session/request_permission", { options: [{ optionId: "allow", kind: "allow_once" }] }),
    ).toEqual({ outcome: { outcome: "cancelled" } });
    // The client advertises no fs capability, so a file request names itself refused.
    expect(() => connection.ask("fs/read_text_file", { path: "/etc/passwd" })).toThrow();
  });

  it("reports a stop at the output limit instead of the partial answer", async () => {
    const agent = fakeAgent({ stopReason: "max_tokens" });
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    expect(await sessions.run(INPUT)).toEqual({
      ok: false,
      code: "generation_failed",
      message: "The model stopped at its output token limit before the rewrite was complete.",
    });
  });

  it("reports a refusal and a cancelled turn as failures", async () => {
    const refused = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, fakeAgent({ stopReason: "refusal" }).connect);
    expect(await refused.run(INPUT)).toMatchObject({ ok: false, code: "generation_failed" });
    const cancelled = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, fakeAgent({ stopReason: "cancelled" }).connect);
    expect(await cancelled.run(INPUT)).toMatchObject({ ok: false, code: "generation_failed" });
  });

  it("answers a thought-only turn with the empty-output failure", async () => {
    const agent = fakeAgent({
      script: (sessionId, emit) => {
        emit("session/update", { sessionId, update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hmm" } } });
      },
    });
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    expect(await sessions.run(INPUT)).toMatchObject({ ok: false, code: "empty_output" });
  });

  it("times out against an agent that never answers", async () => {
    const agent = fakeAgent({ hang: true });
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    expect(await sessions.run({ ...INPUT, timeoutMs: 20 })).toMatchObject({ ok: false, code: "timeout" });
    sessions.close();
  });

  it("reports an agent that exits mid-turn instead of an answer", async () => {
    const agent = fakeAgent({
      hang: true,
      script: (sessionId, emit) => {
        emit("session/update", { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "half" } } });
        agent.connections[0]!.exit("The ACP agent exited with code 1: auth expired");
      },
    });
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    expect(await sessions.run(INPUT)).toMatchObject({ ok: false, code: "generation_failed" });
  });

  it("refuses an agent speaking another protocol version", async () => {
    const agent = fakeAgent({ protocolVersion: 2 });
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    expect(await sessions.run(INPUT)).toEqual({ ok: false, code: "spawn_failed", message: 'The "cline" agent could not initialize.' });
    await sessions.run(INPUT);
    expect(agent.connections).toHaveLength(2);
  });

  it("names the CLI when initialization fails", async () => {
    const agent = fakeAgent({ failInitialize: true });
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    expect(await sessions.run(INPUT)).toEqual({ ok: false, code: "spawn_failed", message: 'The "cline" agent could not initialize.' });
    await sessions.run(INPUT);
    expect(agent.connections).toHaveLength(2);
  });

  it("fails a run whose streamed answer exceeds the capture limit", async () => {
    const big = "x".repeat(600 * 1024);
    const agent = fakeAgent({
      script: (sessionId, emit) => {
        for (let index = 0; index < 5; index += 1) {
          emit("session/update", { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: big } } });
        }
      },
    });
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    expect(await sessions.run(INPUT)).toEqual({
      ok: false,
      code: "generation_failed",
      message: 'The rewrite CLI "cline" exceeded the output capture limit.',
    });
  });

  // One warm process, many rewrites: each gets its own session, and a deadline
  // abort on one closes the shared agent for the other — the codex contract.
  it("keeps concurrent rewrites on distinct sessions of the shared process", async () => {
    const agent = fakeAgent();
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    const results = await Promise.all([sessions.run(INPUT), sessions.run(INPUT)]);
    expect(results.every((result) => result.ok)).toBe(true);
    const prompts = methods(agent.connections[0]!.calls, "session/prompt");
    expect(prompts).toHaveLength(2);
    expect(prompts[0]!.params.sessionId).not.toBe(prompts[1]!.params.sessionId);
  });

  it("stops on close and does not restart the process", async () => {
    const agent = fakeAgent();
    const sessions = createAcpSessions("cline", { command: "cline", args: [], cwd: "" }, agent.connect);
    await sessions.run(INPUT);
    sessions.close();
    // close stops the server synchronously; drain the exited continuation that re-stops.
    await Promise.resolve();
    await Promise.resolve();
    expect(agent.connections[0]!.closed).toBe(true);
  });
});
