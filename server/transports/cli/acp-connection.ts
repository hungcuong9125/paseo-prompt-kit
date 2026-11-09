import { spawn } from "node:child_process";
import { killTree } from "./process.js";

/**
 * One ACP (Agent Client Protocol) connection to a CLI's server child over stdio.
 *
 * The client side of ACP v1: `initialize`, `session/new`, `session/prompt`, and the
 * `session/update` notification stream. A request the agent makes of us is answered by
 * the registered handler (a rewrite denies every permission); anything the handler
 * rejects is answered with a JSON-RPC error. When the process exits, every pending
 * request rejects.
 */

export interface AcpNotification {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface AcpConnection {
  request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  notify(method: string, params?: Record<string, unknown>): void;
  /** Returns an unsubscribe function. */
  onNotification(listener: (notification: AcpNotification) => void): () => void;
  /** Answers a request the agent makes of us; the return value becomes the result. */
  onAgentRequest(handler: (method: string, params: Record<string, unknown>) => unknown): void;
  /** Called once, when the process is gone for any reason. */
  onExit(listener: (reason: string) => void): void;
  readonly pid: number | null;
  close(): void;
}

export interface AcpSpawnOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export type AcpConnector = (options: AcpSpawnOptions) => AcpConnection;

/** Enough stderr to explain an exit, without holding a runaway log. */
const STDERR_TAIL_CHARS = 2_000;

export const connectAcpAgent: AcpConnector = ({ command, args, cwd }) => {
  const child = spawn(command, [...args], {
    cwd,
    env: process.env,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  const listeners = new Set<(notification: AcpNotification) => void>();
  const exitListeners: ((reason: string) => void)[] = [];
  let agentRequest: ((method: string, params: Record<string, unknown>) => unknown) | null = null;
  let nextId = 0;
  let stderrTail = "";
  let buffered = "";
  let exited: string | null = null;

  function write(message: Record<string, unknown>): void {
    if (exited !== null) return;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  }

  function exit(reason: string): void {
    if (exited !== null) return;
    exited = reason;
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
    for (const listener of exitListeners) listener(reason);
  }

  function handle(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (message === null || typeof message !== "object" || Array.isArray(message)) return;
    const id = typeof message.id === "number" ? message.id : null;
    if (typeof message.method === "string") {
      if (message.id !== undefined) {
        if (agentRequest === null) {
          write({ id: message.id, error: { code: -32601, message: "PromptKit handles no agent requests during a rewrite." } });
          return;
        }
        try {
          const params = (message.params ?? {}) as Record<string, unknown>;
          write({ id: message.id, result: agentRequest(message.method, params) });
        } catch (error) {
          // A thrown handler means "this client does not do that": method-not-found,
          // not an internal error.
          write({ id: message.id, error: { code: -32601, message: error instanceof Error ? error.message : "Refused." } });
        }
        return;
      }
      const params = (message.params ?? {}) as Record<string, unknown>;
      for (const listener of listeners) listener({ method: message.method, params });
      return;
    }
    if (id === null) return;
    const waiter = pending.get(id);
    if (waiter === undefined) return;
    pending.delete(id);
    const error = message.error as { message?: unknown } | undefined;
    if (error !== undefined) waiter.reject(new Error(typeof error.message === "string" ? error.message : "The agent refused the request."));
    else waiter.resolve((message.result ?? {}) as Record<string, unknown>);
  }

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffered += chunk;
    if (buffered.length > 2 * 1024 * 1024) {
      exit("The agent's response exceeded the capture limit.");
      killTree(child);
      return;
    }
    let newline = buffered.indexOf("\n");
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line !== "") handle(line);
      newline = buffered.indexOf("\n");
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_CHARS);
  });
  child.stdin.on("error", () => undefined);
  child.on("error", (error: Error) => exit(`The ACP agent could not start: ${error.message}`));
  child.on("close", (code: number | null) => {
    const detail = stderrTail.trim().split("\n").pop()?.trim() ?? "";
    exit(`The ACP agent exited with ${code === null ? "a signal" : `code ${code}`}${detail === "" ? "." : `: ${detail}`}`);
  });

  return {
    request(method, params) {
      if (exited !== null) return Promise.reject(new Error(exited));
      nextId += 1;
      const id = nextId;
      // Executor form: the project's ES2023 lib predates Promise.withResolvers.
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        write({ id, method, params });
      });
    },
    notify(method, params) {
      write(params === undefined ? { method } : { method, params });
    },
    onNotification(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onAgentRequest(handler) {
      agentRequest = handler;
    },
    onExit(listener) {
      if (exited !== null) listener(exited);
      else exitListeners.push(listener);
    },
    pid: child.pid ?? null,
    close() {
      exit("The ACP agent was closed.");
      killTree(child);
    },
  };
};
