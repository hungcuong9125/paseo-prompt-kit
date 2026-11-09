import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { noTrace, type Trace } from "../../log.js";
import { RewriteDeadline } from "../../rewrite-engine/deadline.js";
import { connectAcpAgent, type AcpConnection, type AcpConnector, type AcpSpawnOptions } from "./acp-connection.js";
import { MAX_CAPTURE_CHARS } from "./process.js";

export const ACP_IDLE_CLOSE_MS = 10 * 60_000;

export interface AcpRewriteInput {
  readonly systemPrompt: string;
  readonly taskPrompt: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export type AcpRewriteResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: "timeout" | "spawn_failed" | "empty_output" | "generation_failed"; readonly message: string };

export interface AcpSessions {
  run(input: AcpRewriteInput, trace?: Trace): Promise<AcpRewriteResult>;
  close(): void;
}

interface Server {
  connection: AcpConnection;
  cwd: string;
  exited: Promise<string>;
}

/** Reported when a model stopped at its output limit; the partial text is never a rewrite. */
const TRUNCATED_MESSAGE = "The model stopped at its output token limit before the rewrite was complete.";

/** A rewrite grants nothing: select a reject option when the agent offers one. */
function denyPermission(params: Record<string, unknown>): unknown {
  const options = Array.isArray(params.options) ? params.options : [];
  for (const option of options) {
    if (option !== null && typeof option === "object" && "optionId" in option && "kind" in option) {
      const { optionId, kind } = option;
      if (kind === "reject_once" || kind === "reject_always") return { outcome: { outcome: "selected", optionId } };
    }
  }
  return { outcome: { outcome: "cancelled" } };
}

/** Appends one streamed agent message chunk; thought and tool updates are ignored. */
function chunkText(params: Record<string, unknown>): string | null {
  const update = params.update;
  if (update === null || typeof update !== "object" || !("sessionUpdate" in update)) return null;
  if (update.sessionUpdate !== "agent_message_chunk" || !("content" in update)) return null;
  const content = update.content;
  if (content === null || typeof content !== "object" || !("text" in content)) return null;
  const { text } = content;
  return typeof text === "string" ? text : null;
}

/**
 * Answers rewrites on one warm ACP agent process per CLI. Every rewrite owns a
 * fresh `session/new`; the process is reused and closed after ten idle minutes.
 */
export function createAcpSessions(label: string, spawn: AcpSpawnOptions, connect: AcpConnector = connectAcpAgent): AcpSessions {
  let server: Promise<Server> | null = null;
  let connection: AcpConnection | null = null;
  let generation = 0;
  let active = 0;
  let idle: number | NodeJS.Timeout | null = null;

  function stop() {
    generation += 1;
    const pending = server;
    server = null;
    connection?.close();
    connection = null;
    if (idle !== null) {
      clearTimeout(idle);
      idle = null;
    }
    void pending?.then((running) => rm(running.cwd, { recursive: true, force: true })).catch(() => {});
  }

  async function start(trace: Trace): Promise<Server> {
    const current = generation;
    const cwd = await mkdtemp(path.join(tmpdir(), "prompt-kit-acp-"));
    let child: AcpConnection | null = null;
    try {
      if (generation !== current) throw new Error("Cancelled before startup.");
      child = connect({ ...spawn, cwd });
      connection = child;
      const exited = new Promise<string>((resolve) => child!.onExit(resolve));
      void exited.then(() => { if (connection === child) stop(); });
      child.onAgentRequest((method, params) => {
        if (method !== "session/request_permission") {
          throw new Error("The rewrite handles no other agent request.");
        }
        return denyPermission(params);
      });
      const introduced = await child.request("initialize", {
        protocolVersion: 1,
        // No fs, terminal, auth, elicitation or update capabilities: the agent
        // must not ask this client for any of them during a rewrite.
        clientCapabilities: {},
        clientInfo: { name: "prompt-kit", title: "PromptKit", version: "1" },
      });
      if (introduced.protocolVersion !== 1) throw new Error(`The agent spoke ACP protocol ${String(introduced.protocolVersion)}.`);
      if (generation !== current) throw new Error("Cancelled during startup.");
      trace("acp server start", { pid: child.pid });
      return { connection: child, cwd, exited };
    } catch (error) {
      child?.close();
      if (connection === child) connection = null;
      await rm(cwd, { recursive: true, force: true });
      throw error;
    }
  }

  return {
    async run(input, trace = noTrace) {
      active += 1;
      if (idle) clearTimeout(idle);
      const deadline = new RewriteDeadline(input.timeoutMs, input.signal);
      const abort = () => stop();
      deadline.signal.addEventListener("abort", abort, { once: true });
      let running: Server | null = null;
      let unsubscribe = () => {};
      try {
        if (deadline.signal.aborted) throw new Error("Cancelled.");
        server ??= start(trace);
        running = await deadline.wait(server);
        const opened = await deadline.wait(running.connection.request("session/new", { cwd: running.cwd, mcpServers: [] }));
        const id = opened.sessionId;
        if (typeof id !== "string") throw new Error("Missing session identity.");
        trace("acp session", { session: id, reusedProcess: true });
        let text = "";
        let overCapture = false;
        unsubscribe = running.connection.onNotification((event) => {
          if (event.method !== "session/update" || event.params.sessionId !== id) return;
          const chunk = chunkText(event.params);
          if (chunk !== null) text += chunk;
          // Same bound as the process transport: a runaway agent must not be
          // able to exhaust the daemon's memory through streamed chunks.
          if (text.length > MAX_CAPTURE_CHARS) overCapture = true;
        });
        const finished = deadline.wait(
          running.connection.request("session/prompt", {
            sessionId: id,
            // ACP v1 has no system-prompt channel: the rewrite contract travels
            // inside the prompt, before the wrapped draft.
            prompt: [{ type: "text", text: `${input.systemPrompt}\n\n${input.taskPrompt}` }],
          }),
        );
        const settled = await deadline.wait(Promise.race([finished, running.exited]));
        if (typeof settled !== "object" || settled === null) {
          return { ok: false, code: "generation_failed", message: `The rewrite CLI "${label}" exited before finishing the rewrite.` };
        }
        if (overCapture) {
          return { ok: false, code: "generation_failed", message: `The rewrite CLI "${label}" exceeded the output capture limit.` };
        }
        const reason = typeof settled.stopReason === "string" ? settled.stopReason : "end_turn";
        if (reason === "max_tokens") return { ok: false, code: "generation_failed", message: TRUNCATED_MESSAGE };
        if (reason === "cancelled") return { ok: false, code: "generation_failed", message: `The rewrite CLI "${label}" did not complete the rewrite.` };
        if (reason === "refusal") return { ok: false, code: "generation_failed", message: `The rewrite CLI "${label}" refused the rewrite.` };
        if (!text.trim()) return { ok: false, code: "empty_output", message: `The rewrite CLI "${label}" finished without an answer.` };
        return { ok: true, text };
      } catch {
        if (deadline.signal.aborted) {
          return { ok: false, code: "timeout", message: `The rewrite CLI "${label}" did not answer within the rewrite budget.` };
        }
        if (!running) {
          stop();
          return { ok: false, code: "spawn_failed", message: `The "${label}" agent could not initialize.` };
        }
        return { ok: false, code: "generation_failed", message: `The rewrite CLI "${label}" failed. Check CLI authentication and configuration.` };
      } finally {
        unsubscribe();
        deadline.signal.removeEventListener("abort", abort);
        deadline.dispose();
        active -= 1;
        if (active === 0 && server) {
          idle = setTimeout(stop, ACP_IDLE_CLOSE_MS);
          (idle as unknown as { unref?: () => void }).unref?.();
        }
      }
    },
    close: stop,
  };
}
