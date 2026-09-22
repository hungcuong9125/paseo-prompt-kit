import { spawn } from "node:child_process";

/** A runaway CLI must not be able to exhaust the daemon's memory. */
const MAX_CAPTURE_CHARS = 2 * 1024 * 1024;

export interface CliRunInput {
  readonly command: string;
  readonly args: readonly string[];
  /** Written to the child's stdin and then closed. Null leaves stdin empty. */
  readonly stdin: string | null;
  readonly cwd: string;
  readonly timeoutMs: number;
}

export interface CliRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

export type CliSpawner = (input: CliRunInput) => Promise<CliRunResult>;

function append(captured: string[], chunk: string): boolean {
  captured.push(chunk);
  let total = 0;
  for (const part of captured) total += part.length;
  return total > MAX_CAPTURE_CHARS;
}

/**
 * Kills the whole process tree.
 *
 * A CLI spawns its own children (a server, a language runtime). Killing only the
 * direct child leaves those running and holding the pipes, so the promise never
 * settles. The child is started in its own process group so the group can be
 * signalled as a unit.
 */
function killTree(child: ReturnType<typeof spawn>): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already exited, or the group is gone.
  }
}

/**
 * Runs one CLI to completion and captures its output.
 *
 * The prompt reaches the process through stdin or a file, never `argv`, so it is
 * not readable by another user's `ps`. A timeout kills the process tree and
 * reports `timedOut` rather than rejecting: the caller decides what a partial or
 * absent answer means.
 */
export const spawnCli: CliSpawner = (input) =>
  new Promise<CliRunResult>((resolve) => {
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd,
      env: process.env,
      // Own process group on POSIX so the whole tree can be signalled.
      detached: process.platform !== "win32",
      stdio: [input.stdin === null ? "ignore" : "pipe", "pipe", "pipe"],
    });

    const out: string[] = [];
    const err: string[] = [];
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, input.timeoutMs);

    function settle(result: Omit<CliRunResult, "stdout" | "stderr" | "truncated" | "timedOut">): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: out.join(""),
        stderr: err.join(""),
        truncated,
        timedOut,
        ...result,
      });
    }

    child.on("error", (error: Error) => {
      err.push(error.message);
      settle({ exitCode: null });
    });

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (append(out, chunk)) truncated = true;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (append(err, chunk)) truncated = true;
    });

    if (child.stdin) {
      child.stdin.on("error", () => {
        // A CLI that exits before reading stdin closes the pipe early; that is
        // not a failure of the run, so the write error is dropped.
      });
      if (input.stdin !== null) child.stdin.end(input.stdin);
      else child.stdin.end();
    }

    child.on("close", (code: number | null) => {
      settle({ exitCode: code });
    });
  });
