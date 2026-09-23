import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CliFamily } from "./family.js";
import { spawnCli, type CliRunResult, type CliSpawner } from "./process.js";

export interface CliRewriteInput {
  readonly family: CliFamily;
  readonly model: string;
  readonly thinkingOptionId: string | null;
  readonly systemPrompt: string;
  readonly taskPrompt: string;
  readonly timeoutMs: number;
}

export interface CliRewriteDependencies {
  /** Test seam: replaces the process spawner. */
  spawn?: CliSpawner;
  /** Test seam: observes the working directory a run was given. */
  onCwd?: (cwd: string) => void;
}

export type CliRewriteResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly code: "timeout" | "spawn_failed" | "empty_output" | "generation_failed";
      readonly message: string;
    };

/** Enough of a CLI's own error text to recognise it, on one line. */
function firstLine(text: string, max = 200): string {
  const line = text.split("\n").map((part) => part.trim()).find((part) => part !== "") ?? "";
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

/**
 * Runs one rewrite through a CLI in a scratch directory.
 *
 * The working directory is empty and temporary, so a CLI that discovers project
 * files discovers nothing: the answer depends on the prompt and the model only.
 * It is removed in `finally`, including on timeout.
 */
export async function runCliRewrite(
  input: CliRewriteInput,
  dependencies: CliRewriteDependencies = {},
): Promise<CliRewriteResult> {
  const spawn = dependencies.spawn ?? spawnCli;
  const scratch = await mkdtemp(path.join(tmpdir(), "prompt-kit-"));
  dependencies.onCwd?.(scratch);

  try {
    let promptFilePath: string | null = null;
    if (input.family.promptDelivery === "file") {
      promptFilePath = path.join(scratch, "prompt.txt");
      await writeFile(promptFilePath, input.taskPrompt, "utf8");
    }

    const invocation = input.family.buildInvocation({
      model: input.model,
      thinkingOptionId: input.thinkingOptionId,
      systemPrompt: input.systemPrompt,
      promptFilePath,
    });

    let result: CliRunResult;
    try {
      result = await spawn({
        command: invocation.command,
        args: invocation.args,
        stdin: input.family.promptDelivery === "stdin" ? input.taskPrompt : null,
        cwd: scratch,
        timeoutMs: input.timeoutMs,
      });
    } catch (error) {
      return {
        ok: false,
        code: "spawn_failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }

    if (result.timedOut) {
      return { ok: false, code: "timeout", message: "The rewrite timed out." };
    }

    // A failed run never becomes a rewrite: its stdout can hold an error text
    // that would otherwise read like an answer.
    const reported = input.family.parseError(result.stdout);
    if (reported !== null) {
      return {
        ok: false,
        code: "generation_failed",
        message: `The rewrite CLI "${input.family.id}" reported an error: ${firstLine(reported)}`,
      };
    }
    if (result.exitCode !== 0) {
      const detail = firstLine(result.stderr);
      return {
        ok: false,
        code: "generation_failed",
        message: `The rewrite CLI "${input.family.id}" exited with ${
          result.exitCode === null ? "a signal" : `code ${result.exitCode}`
        }${detail === "" ? "." : `: ${detail}`}`,
      };
    }

    const text = input.family.parseOutput(result.stdout);
    if (text === null || text.trim() === "") {
      return {
        ok: false,
        code: "empty_output",
        message: "The rewrite CLI returned no text.",
      };
    }
    return { ok: true, text };
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }
}
