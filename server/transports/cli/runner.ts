import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { noTrace, type Trace } from "../../log.js";
import type { AcpSessions } from "./acp-sessions.js";
import type { CodexSessions } from "./codex-sessions.js";
import type { CliFamily, ProcessCliFamily } from "./family.js";
import { TRUNCATED_MESSAGE } from "./family.js";
import { spawnCli, type CliRunResult, type CliSpawner } from "./process.js";

export interface CliRewriteInput {
  readonly family: CliFamily;
  readonly model: string;
  readonly thinkingOptionId: string | null;
  readonly systemPrompt: string;
  readonly taskPrompt: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface CliRewriteDependencies {
  /** Test seam: replaces the process spawner. */
  spawn?: CliSpawner;
  /** Test seam: observes the working directory a run was given. */
  onCwd?: (cwd: string) => void;
  /** Debug detail lines; a no-op unless `debugLog` is on. */
  trace?: Trace;
  /** The warm codex server a `session` family runs on; required when one is resolved. */
  codex?: CodexSessions;
  /** The warm ACP agent for an `acp` family's id; required when one is resolved. */
  acp?: (familyId: string) => AcpSessions;
}

export type CliRewriteResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly code: "timeout" | "spawn_failed" | "empty_output" | "generation_failed";
      readonly message: string;
    };

/** The argv for a trace: any argument carrying the system prompt is reduced to its length. */
function describeArgs(args: readonly string[], systemPrompt: string): string {
  const hidden = `<system prompt, ${systemPrompt.length} chars>`;
  return JSON.stringify(args.map((arg) => (systemPrompt !== "" && arg.includes(systemPrompt) ? hidden : arg)));
}

/** Runs one rewrite through the family's CLI: a one-shot process, or a warm session. */
export async function runCliRewrite(
  input: CliRewriteInput,
  dependencies: CliRewriteDependencies = {},
): Promise<CliRewriteResult> {
  const family = input.family;
  if (family.kind === "session") {
    if (dependencies.codex === undefined) throw new Error(`No session server is wired for "${family.id}".`);
    return dependencies.codex.run(
      {
        model: input.model,
        effort: input.thinkingOptionId,
        systemPrompt: input.systemPrompt,
        taskPrompt: input.taskPrompt,
        timeoutMs: input.timeoutMs,
        ...(input.signal ? { signal: input.signal } : {}),
      },
      dependencies.trace,
    );
  }
  if (family.kind === "acp") {
    if (dependencies.acp === undefined) throw new Error(`No ACP agent is wired for "${family.id}".`);
    // ACP carries no model selection: the agent runs the model its own CLI has.
    return dependencies.acp(family.id).run(
      {
        systemPrompt: input.systemPrompt,
        taskPrompt: input.taskPrompt,
        timeoutMs: input.timeoutMs,
        ...(input.signal ? { signal: input.signal } : {}),
      },
      dependencies.trace,
    );
  }
  return runProcess({ ...input, family }, dependencies);
}

/**
 * Runs one rewrite through a one-shot CLI process in a scratch directory.
 *
 * The working directory is empty and temporary, so a CLI that discovers project
 * files discovers nothing: the answer depends on the prompt and the model only.
 * It is removed in `finally`, including on timeout.
 */
async function runProcess(
  input: CliRewriteInput & { readonly family: ProcessCliFamily },
  dependencies: CliRewriteDependencies,
): Promise<CliRewriteResult> {
  const spawn = dependencies.spawn ?? spawnCli;
  const trace = dependencies.trace ?? noTrace;
  const scratch = await mkdtemp(path.join(tmpdir(), "prompt-kit-"));
  dependencies.onCwd?.(scratch);

  try {
    let promptFilePath: string | null = null;
    if (input.family.promptDelivery === "file") {
      promptFilePath = path.join(scratch, "prompt.txt");
      await writeFile(promptFilePath, input.taskPrompt, { encoding: "utf8", mode: 0o600 });
    }

    if (input.signal?.aborted) return { ok: false, code: "timeout", message: "The rewrite budget expired before the CLI could start." };
    const scratchFilePaths: Record<string, string> = {};
    const request = {
      model: input.model,
      thinkingOptionId: input.thinkingOptionId,
      systemPrompt: input.systemPrompt,
      promptFilePath,
      scratchFilePaths,
    };
    // Written in declaration order, so a file's content can point at an earlier file's path.
    for (const file of input.family.scratchFiles ?? []) {
      const filePath = path.join(scratch, file.name);
      await writeFile(filePath, file.content(request), { encoding: "utf8", mode: 0o600 });
      scratchFilePaths[file.name] = filePath;
    }
    const invocation = input.family.buildInvocation(request);

    trace("cli spawn", {
      family: input.family.id,
      command: invocation.command,
      args: describeArgs(invocation.args, input.systemPrompt),
      // Names only: a value can carry the system prompt.
      env: Object.keys(invocation.env).join(","),
      delivery: input.family.promptDelivery,
      taskChars: input.taskPrompt.length,
      timeoutMs: input.timeoutMs,
    });
    const startedAt = Date.now();
    let result: CliRunResult;
    try {
      result = await spawn({
        command: invocation.command,
        args: invocation.args,
        env: invocation.env,
        stdin: input.family.promptDelivery === "stdin" ? input.taskPrompt : null,
        cwd: scratch,
        timeoutMs: input.timeoutMs,
        ...(input.signal ? { signal: input.signal } : {}),
      });
    } catch {
      trace("cli spawn failed", { family: input.family.id });
      return {
        ok: false,
        code: "spawn_failed",
        message: `The rewrite CLI "${input.family.id}" could not start. Check that it is installed and available to the host.`,
      };
    }

    trace("cli exit", {
      family: input.family.id,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: Date.now() - startedAt,
      stdoutChars: result.stdout.length,
      stderrChars: result.stderr.length,
      captureTruncated: result.truncated,
    });


    if (result.timedOut) {
      return {
        ok: false,
        code: "timeout",
        message: `The rewrite CLI "${input.family.id}" did not answer within ${Math.round(input.timeoutMs / 1000)} s. A cold CLI start can take this long; try again, or use a faster model or the Direct API transport.`,
      };
    }

    // A failed run never becomes a rewrite: its stdout can hold an error text
    // that would otherwise read like an answer. Only the static truncation
    // verdict is forwarded verbatim — it names the real cause without echoing
    // provider or prompt content; every other failure keeps its fixed message.
    const reported = input.family.parseError(result.stdout);
    if (reported === TRUNCATED_MESSAGE) {
      return { ok: false, code: "generation_failed", message: TRUNCATED_MESSAGE };
    }
    if (reported !== null) {
      return {
        ok: false,
        code: "generation_failed",
        message: `The rewrite CLI "${input.family.id}" reported an error. Check CLI authentication and configuration.`,
      };
    }
    if (result.exitCode !== 0) {
      return {
        ok: false,
        code: "generation_failed",
        message: `The rewrite CLI "${input.family.id}" exited with ${
          result.exitCode === null ? "a signal" : `code ${result.exitCode}`
        }.`,
      };
    }

    if (result.truncated) return { ok: false, code: "generation_failed", message: "The CLI exceeded the output capture limit." };
    const text = input.family.parseOutput(result.stdout);
    if (text === null || text.trim() === "") {
      return {
        ok: false,
        code: "empty_output",
        message: `The rewrite CLI "${input.family.id}" finished without an answer${
          result.stdout.trim() === "" ? " and printed nothing" : ""
        }.`,
      };
    }
    return { ok: true, text };
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }
}
