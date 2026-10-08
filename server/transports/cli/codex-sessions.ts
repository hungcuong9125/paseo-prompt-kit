import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { noTrace, type Trace } from "../../log.js";
import { RewriteDeadline } from "../../rewrite-engine/deadline.js";
import { connectCodexAppServer, type CodexConnection, type CodexConnector } from "./codex-app-server.js";

export const IDLE_CLOSE_MS = 10 * 60_000;

export interface CodexRewriteInput {
  readonly model: string;
  readonly effort: string | null;
  readonly systemPrompt: string;
  readonly taskPrompt: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}
export type CodexRewriteResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: "timeout" | "spawn_failed" | "empty_output" | "generation_failed"; readonly message: string };
export interface CodexSessions {
  run(input: CodexRewriteInput, trace?: Trace): Promise<CodexRewriteResult>;
  close(): void;
}
interface Server { connection: CodexConnection; cwd: string; exited: Promise<string> }

/** Reuses the process only; every rewrite owns an ephemeral, single-use conversation. */
export function createCodexSessions(connect: CodexConnector = connectCodexAppServer): CodexSessions {
  let server: Promise<Server> | null = null;
  let connection: CodexConnection | null = null;
  let generation = 0;
  let active = 0;
  let idle: ReturnType<typeof setTimeout> | null = null;

  function stop() {
    generation += 1;
    const pending = server;
    server = null;
    connection?.close();
    connection = null;
    if (idle) clearTimeout(idle);
    idle = null;
    void pending?.then((running) => rm(running.cwd, { recursive: true, force: true })).catch(() => {});
  }

  async function start(trace: Trace): Promise<Server> {
    const current = generation;
    const cwd = await mkdtemp(path.join(tmpdir(), "prompt-kit-codex-"));
    let child: CodexConnection | null = null;
    try {
      if (generation !== current) throw new Error("Cancelled before startup.");
      child = connect(cwd);
      connection = child;
      const exited = new Promise<string>((resolve) => child!.onExit(resolve));
      void exited.then(() => { if (connection === child) stop(); });
      await child.request("initialize", { clientInfo: { name: "prompt-kit", title: null, version: "1" }, capabilities: null });
      if (generation !== current) throw new Error("Cancelled during startup.");
      child.notify("initialized");
      trace("codex server start", { pid: child.pid });
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
      let threadId: string | null = null;
      let unsubscribe = () => {};
      try {
        if (deadline.signal.aborted) throw new Error("Cancelled.");
        server ??= start(trace);
        running = await deadline.wait(server);
        const opened = await deadline.wait(running.connection.request("thread/start", {
          ...(input.model ? { model: input.model } : {}), cwd: running.cwd,
          sandbox: "read-only", approvalPolicy: "never",
          developerInstructions: input.systemPrompt, ephemeral: true,
        }));
        const id = (opened.thread as { id?: unknown } | undefined)?.id;
        if (typeof id !== "string") throw new Error("Missing thread identity.");
        threadId = id;
        trace("codex thread", { thread: id, isolated: true });
        let text = "";
        let complete!: (status: string) => void;
        const done = new Promise<string>((resolve) => { complete = resolve; });
        unsubscribe = running.connection.onNotification((event) => {
          if (event.params.threadId !== id) return;
          if (event.method === "item/completed") {
            const item = event.params.item as { type?: string; text?: string } | undefined;
            if (item?.type === "agentMessage" && typeof item.text === "string") text = item.text;
          }
          if (event.method === "turn/completed") {
            complete((event.params.turn as { status?: string } | undefined)?.status ?? "unknown");
          }
        });
        await deadline.wait(running.connection.request("turn/start", {
          threadId: id, input: [{ type: "text", text: input.taskPrompt, text_elements: [] }],
          ...(input.effort === null ? {} : { effort: input.effort }),
        }));
        const status = await deadline.wait(Promise.race([done, running.exited]));
        if (status !== "completed") return { ok: false, code: "generation_failed", message: 'The rewrite CLI "codex" did not complete the rewrite.' };
        if (!text.trim()) return { ok: false, code: "empty_output", message: 'The rewrite CLI "codex" finished without an answer.' };
        return { ok: true, text };
      } catch {
        if (deadline.signal.aborted) return { ok: false, code: "timeout", message: 'The rewrite CLI "codex" did not answer within the rewrite budget.' };
        if (!running) { stop(); return { ok: false, code: "spawn_failed", message: "The codex server could not initialize." }; }
        return { ok: false, code: "generation_failed", message: "The codex rewrite failed. Check CLI authentication and configuration." };
      } finally {
        if (threadId && running && !deadline.signal.aborted) {
          try { await deadline.wait(running.connection.request("thread/unsubscribe", { threadId })); } catch { stop(); }
        }
        unsubscribe();
        deadline.signal.removeEventListener("abort", abort);
        deadline.dispose();
        active -= 1;
        if (active === 0 && server) { idle = setTimeout(stop, IDLE_CLOSE_MS); (idle as unknown as { unref?: () => void }).unref?.(); }
      }
    },
    close: stop,
  };
}
