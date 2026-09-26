import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { noTrace, type Trace } from "../../log.js";
import { connectCodexAppServer, type CodexConnection, type CodexConnector, type CodexNotification } from "./codex-app-server.js";
import { innermostMessage } from "./family.js";

/**
 * Warm codex rewrites: one `codex app-server` per plugin, reused threads on it.
 *
 * codex keys OpenAI's prompt cache by thread, so a thread that already carries the rewrite
 * rules answers in about 2–3 s where a fresh `codex exec` takes about 7 s. A thread serves one
 * (model, system prompt) pair and at most `TURNS_PER_THREAD` rewrites, then is dropped, so
 * earlier drafts never pile up in its context. A busy thread is never shared: a concurrent
 * rewrite gets its own. A timed-out turn is interrupted and its thread dropped. The server
 * stops after `IDLE_CLOSE_MS` without a rewrite and starts again on the next one.
 */

export const TURNS_PER_THREAD = 8;
export const IDLE_CLOSE_MS = 10 * 60_000;

export interface CodexRewriteInput {
  /** Empty means codex's configured default. */
  readonly model: string;
  /** codex reasoning effort, or null for the model default. */
  readonly effort: string | null;
  readonly systemPrompt: string;
  readonly taskPrompt: string;
  readonly timeoutMs: number;
}

export type CodexRewriteResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly code: "timeout" | "spawn_failed" | "empty_output" | "generation_failed";
      readonly message: string;
    };

export interface CodexSessions {
  run(input: CodexRewriteInput, trace?: Trace): Promise<CodexRewriteResult>;
  /** Stops the server; the next rewrite starts a new one. */
  close(): void;
}

interface Thread {
  readonly id: string;
  readonly key: string;
  turns: number;
  busy: boolean;
}

interface Server {
  readonly connection: CodexConnection;
  readonly cwd: string;
  readonly threads: Thread[];
  /** Resolves with the reason once the process is gone. */
  readonly exited: Promise<string>;
}

interface TurnOutcome {
  readonly status: string;
  readonly text: string;
  readonly error: string | null;
}

/** codex's own failure text, unwrapped from the JSON it often arrives in. */
function turnError(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() !== "" ? innermostMessage(message) : null;
}

export function createCodexSessions(connect: CodexConnector = connectCodexAppServer): CodexSessions {
  let server: Promise<Server> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function stop(): void {
    const current = server;
    server = null;
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
    void current
      ?.then(async (running) => {
        running.connection.close();
        await rm(running.cwd, { recursive: true, force: true });
      })
      .catch(() => undefined);
  }

  function armIdle(): void {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, IDLE_CLOSE_MS);
    // An idle server must not keep the daemon's event loop alive.
    (idleTimer as { unref?: () => void }).unref?.();
  }

  async function start(trace: Trace): Promise<Server> {
    const startedAt = Date.now();
    // An empty directory, so codex discovers no project files or AGENTS.md.
    const cwd = await mkdtemp(path.join(tmpdir(), "prompt-kit-codex-"));
    const connection = connect(cwd);
    const exited = new Promise<string>((resolve) => connection.onExit(resolve));
    const running: Server = { connection, cwd, threads: [], exited };
    void exited.then(() => {
      if (server !== null) void server.then((current) => current === running && stop()).catch(() => undefined);
    });
    try {
      await connection.request("initialize", { clientInfo: { name: "prompt-kit", title: null, version: "1" }, capabilities: null });
    } catch (error) {
      connection.close();
      await rm(cwd, { recursive: true, force: true });
      throw error;
    }
    connection.notify("initialized");
    trace("codex server start", { pid: connection.pid, durationMs: Date.now() - startedAt });
    return running;
  }

  function retire(running: Server, thread: Thread): void {
    const index = running.threads.indexOf(thread);
    if (index !== -1) running.threads.splice(index, 1);
    running.connection.request("thread/unsubscribe", { threadId: thread.id }).catch(() => undefined);
  }

  async function lease(running: Server, input: CodexRewriteInput, trace: Trace): Promise<Thread> {
    const key = `${input.model}\u0000${input.systemPrompt}`;
    const idle = running.threads.find((thread) => thread.key === key && !thread.busy);
    if (idle !== undefined) {
      idle.busy = true;
      trace("codex thread", { thread: idle.id, reused: true, turn: idle.turns + 1 });
      return idle;
    }
    const result = await running.connection.request("thread/start", {
      ...(input.model === "" ? {} : { model: input.model }),
      cwd: running.cwd,
      sandbox: "read-only",
      approvalPolicy: "never",
      developerInstructions: input.systemPrompt,
      // Kept in memory only: no rollout file per rewrite.
      ephemeral: true,
    });
    const id = (result.thread as { id?: unknown } | undefined)?.id;
    if (typeof id !== "string") throw new Error("codex started a thread without an id.");
    const thread: Thread = { id, key, turns: 0, busy: true };
    running.threads.push(thread);
    trace("codex thread", { thread: id, reused: false, turn: 1 });
    return thread;
  }

  /** Resolves when the thread's turn completes; `turnId` is known only after turn/start answers. */
  function watchTurn(connection: CodexConnection, threadId: string) {
    let text = "";
    let error: string | null = null;
    let settle: (outcome: TurnOutcome) => void = () => undefined;
    const done = new Promise<TurnOutcome>((resolve) => {
      settle = resolve;
    });
    const unsubscribe = connection.onNotification((notification: CodexNotification) => {
      if (notification.params.threadId !== threadId) return;
      if (notification.method === "item/completed") {
        const item = notification.params.item as { type?: unknown; text?: unknown } | undefined;
        if (item?.type === "agentMessage" && typeof item.text === "string") text = item.text;
      } else if (notification.method === "error") {
        if (notification.params.willRetry !== true) error = turnError(notification.params.error) ?? error;
      } else if (notification.method === "turn/completed") {
        const turn = notification.params.turn as { status?: unknown; error?: unknown } | undefined;
        settle({ status: typeof turn?.status === "string" ? turn.status : "unknown", text, error: turnError(turn?.error) ?? error });
      }
    });
    return { done, unsubscribe };
  }

  async function runTurn(running: Server, thread: Thread, input: CodexRewriteInput, trace: Trace): Promise<CodexRewriteResult> {
    const startedAt = Date.now();
    const watch = watchTurn(running.connection, thread.id);
    let turnId: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), input.timeoutMs);
    });
    try {
      const started = running.connection.request("turn/start", {
        threadId: thread.id,
        input: [{ type: "text", text: input.taskPrompt, text_elements: [] }],
        ...(input.effort === null ? {} : { effort: input.effort }),
      });
      const response = await Promise.race([started, timedOut]);
      if (response !== "timeout") turnId = ((response.turn as { id?: unknown } | undefined)?.id as string | undefined) ?? null;
      const outcome = response === "timeout" ? "timeout" : await Promise.race([watch.done, timedOut, running.exited]);
      thread.turns += 1;

      if (outcome === "timeout") {
        if (turnId !== null) running.connection.request("turn/interrupt", { threadId: thread.id, turnId }).catch(() => undefined);
        retire(running, thread);
        trace("codex turn", { thread: thread.id, status: "timeout", durationMs: Date.now() - startedAt });
        return {
          ok: false,
          code: "timeout",
          message: `The rewrite CLI "codex" did not answer within ${Math.round(input.timeoutMs / 1000)} s. Try again, or use a faster model or the Direct API transport.`,
        };
      }
      if (typeof outcome === "string") return { ok: false, code: "generation_failed", message: outcome };

      trace("codex turn", {
        thread: thread.id,
        status: outcome.status,
        durationMs: Date.now() - startedAt,
        textChars: outcome.text.length,
        error: outcome.error,
      });
      if (outcome.status !== "completed") {
        retire(running, thread);
        return {
          ok: false,
          code: "generation_failed",
          message: `The rewrite CLI "codex" reported an error: ${outcome.error ?? `the turn ended ${outcome.status}.`}`,
        };
      }
      if (outcome.text.trim() === "") {
        return { ok: false, code: "empty_output", message: 'The rewrite CLI "codex" finished without an answer.' };
      }
      return { ok: true, text: outcome.text };
    } finally {
      if (timer !== null) clearTimeout(timer);
      watch.unsubscribe();
      thread.busy = false;
      if (thread.turns >= TURNS_PER_THREAD) retire(running, thread);
    }
  }

  return {
    async run(input, trace = noTrace) {
      armIdle();
      let running: Server;
      try {
        server ??= start(trace);
        running = await server;
      } catch (error) {
        server = null;
        return { ok: false, code: "spawn_failed", message: error instanceof Error ? error.message : String(error) };
      }
      let thread: Thread;
      try {
        thread = await lease(running, input, trace);
      } catch (error) {
        return {
          ok: false,
          code: "generation_failed",
          message: `The rewrite CLI "codex" could not start a thread: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      try {
        return await runTurn(running, thread, input, trace);
      } catch (error) {
        retire(running, thread);
        return {
          ok: false,
          code: "generation_failed",
          message: `The rewrite CLI "codex" reported an error: ${error instanceof Error ? error.message : String(error)}`,
        };
      } finally {
        armIdle();
      }
    },
    close: stop,
  };
}
