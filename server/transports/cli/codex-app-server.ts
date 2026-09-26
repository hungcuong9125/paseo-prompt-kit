import { spawn } from "node:child_process";
import { killTree } from "./process.js";

/**
 * One JSON-RPC connection to a `codex app-server` child over stdio.
 *
 * Requests resolve with their result or reject with the server's error; notifications go to
 * the listeners. A request the server makes of us (an approval) is refused, since a rewrite
 * never approves anything. When the process exits, every pending request rejects.
 */

export interface CodexNotification {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface CodexConnection {
  request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  notify(method: string): void;
  /** Returns an unsubscribe function. */
  onNotification(listener: (notification: CodexNotification) => void): () => void;
  /** Called once, when the process is gone for any reason. */
  onExit(listener: (reason: string) => void): void;
  readonly pid: number | null;
  close(): void;
}

export type CodexConnector = (cwd: string) => CodexConnection;

/** Enough stderr to explain an exit, without holding a runaway log. */
const STDERR_TAIL_CHARS = 2_000;

export const connectCodexAppServer: CodexConnector = (cwd) => {
  const child = spawn("codex", ["app-server"], {
    cwd,
    env: process.env,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  const listeners = new Set<(notification: CodexNotification) => void>();
  const exitListeners: ((reason: string) => void)[] = [];
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
    const id = typeof message.id === "number" ? message.id : null;
    if (typeof message.method === "string") {
      if (message.id !== undefined) {
        write({ id: message.id, error: { code: -32601, message: "PromptKit approves nothing during a rewrite." } });
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
    if (error !== undefined) waiter.reject(new Error(typeof error.message === "string" ? error.message : "codex refused the request."));
    else waiter.resolve((message.result ?? {}) as Record<string, unknown>);
  }

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffered += chunk;
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
  child.on("error", (error: Error) => exit(`codex app-server could not start: ${error.message}`));
  child.on("close", (code: number | null) => {
    const detail = stderrTail.trim().split("\n").pop()?.trim() ?? "";
    exit(`codex app-server exited with ${code === null ? "a signal" : `code ${code}`}${detail === "" ? "." : `: ${detail}`}`);
  });

  return {
    request(method, params) {
      if (exited !== null) return Promise.reject(new Error(exited));
      nextId += 1;
      const id = nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        write({ id, method, params });
      });
    },
    notify(method) {
      write({ method });
    },
    onNotification(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onExit(listener) {
      if (exited !== null) listener(exited);
      else exitListeners.push(listener);
    },
    pid: child.pid ?? null,
    close() {
      exit("codex app-server was closed.");
      killTree(child);
    },
  };
};
