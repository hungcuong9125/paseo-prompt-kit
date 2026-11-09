import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { geminiFamily, grokFamily, piFamily, claudeFamily, codexFamily, opencodeFamily, TRUNCATED_MESSAGE } from "../../server/transports/cli/family.js";
import type { AcpSessions } from "../../server/transports/cli/acp-sessions.js";
import { spawnCli, type CliRunInput } from "../../server/transports/cli/process.js";
import { runCliRewrite } from "../../server/transports/cli/runner.js";

const BASE = {
  model: "m",
  thinkingOptionId: null,
  systemPrompt: "SYSTEM",
  taskPrompt: "TASK PROMPT",
  timeoutMs: 5_000,
};

describe("runCliRewrite", () => {
  it("writes the prompt to a file for a file-delivery family and deletes the scratch dir", async () => {
    const seen: CliRunInput[] = [];
    let scratch = "";
    const result = await runCliRewrite(
      { ...BASE, family: piFamily },
      {
        onCwd: (cwd) => {
          scratch = cwd;
        },
        spawn: async (run) => {
          seen.push(run);
          // The prompt file exists while the CLI runs and holds the task prompt.
          expect(existsSync(`${run.cwd}/prompt.txt`)).toBe(true);
          return {
            stdout: JSON.stringify({
              type: "turn_end",
              message: { content: [{ type: "text", text: "rewritten" }] },
            }),
            stderr: "",
            exitCode: 0,
            timedOut: false,
            truncated: false,
          };
        },
      },
    );

    expect(result).toEqual({ ok: true, text: "rewritten" });
    expect(seen[0]?.stdin).toBeNull();
    expect(seen[0]?.args).toContain(`@${scratch}/prompt.txt`);
    // The scratch directory is gone after the run, so nothing is left behind.
    expect(existsSync(scratch)).toBe(false);
  });

  it("pipes the prompt through stdin for a stdin-delivery family", async () => {
    let stdin: string | null = "unset";
    const result = await runCliRewrite(
      { ...BASE, family: claudeFamily },
      {
        spawn: async (run) => {
          stdin = run.stdin;
          return {
            stdout: '{"result":"rewritten"}',
            stderr: "",
            exitCode: 0,
            timedOut: false,
            truncated: false,
          };
        },
      },
    );
    expect(result).toEqual({ ok: true, text: "rewritten" });
    expect(stdin).toBe("TASK PROMPT");
  });

  it("writes the declared scratch files and hands their paths to the invocation", async () => {
    let scratch = "";
    let seen: CliRunInput | null = null;
    const result = await runCliRewrite(
      { ...BASE, family: geminiFamily },
      {
        onCwd: (cwd) => {
          scratch = cwd;
        },
        spawn: async (run) => {
          seen = run;
          // The scratch dir still exists while the CLI runs: check file contents now.
          expect(readFileSync(run.env.GEMINI_SYSTEM_MD!, "utf8")).toBe("SYSTEM");
          expect(readFileSync(`${scratch}/deny-tools.toml`, "utf8")).toContain('decision = "deny"');
          return { stdout: '{"response":"rewritten"}', stderr: "", exitCode: 0, timedOut: false, truncated: false };
        },
      },
    );
    expect(result).toEqual({ ok: true, text: "rewritten" });
    const run = seen!;
    expect(run.env.GEMINI_SYSTEM_MD).toBe(`${scratch}/system-prompt.md`);
    expect(run.args).toContain(`${scratch}/deny-tools.toml`);
    expect(run.args).not.toContain("SYSTEM");
    expect(existsSync(scratch)).toBe(false);
  });

  it("delivers a file-prompt family's prompt by file, not argv", async () => {
    let seen: readonly string[] = [];
    await runCliRewrite(
      { ...BASE, family: grokFamily },
      {
        spawn: async (run) => {
          seen = run.args;
          return { stdout: '{"text":"rewritten","stopReason":"end_turn"}', stderr: "", exitCode: 0, timedOut: false, truncated: false };
        },
      },
    );
    const promptIndex = seen.indexOf("--prompt-file");
    expect(promptIndex).toBeGreaterThan(-1);
    expect(seen[promptIndex + 1]).toMatch(/prompt\.txt$/);
    expect(seen).not.toContain("TASK PROMPT");
  });

  it("hands an acp family to its warm agent without spawning a process", async () => {
    const runs: { systemPrompt: string; taskPrompt: string }[] = [];
    const acp = (familyId: string): AcpSessions => ({
      run: async (input) => {
        expect(familyId).toBe("cline");
        runs.push({ systemPrompt: input.systemPrompt, taskPrompt: input.taskPrompt });
        return { ok: true, text: "rewritten" };
      },
      close: () => undefined,
    });
    const result = await runCliRewrite(
      { ...BASE, family: { kind: "acp", id: "cline", command: "cline", args: ["--acp"] } },
      { acp },
    );
    expect(result).toEqual({ ok: true, text: "rewritten" });
    expect(runs).toEqual([{ systemPrompt: "SYSTEM", taskPrompt: "TASK PROMPT" }]);
    await expect(
      runCliRewrite({ ...BASE, family: { kind: "acp", id: "cline", command: "cline", args: [] } }, {}),
    ).rejects.toThrow('No ACP agent is wired for "cline".');
  });

  it("names a truncated CLI answer instead of an auth hint", async () => {
    const result = await runCliRewrite(
      { ...BASE, family: grokFamily },
      {
        spawn: async () => ({
          stdout: '{"text":"half","stopReason":"max_tokens"}',
          stderr: "",
          exitCode: 0,
          timedOut: false,
          truncated: false,
        }),
      },
    );
    expect(result).toEqual({ ok: false, code: "generation_failed", message: TRUNCATED_MESSAGE });
  });

  it("reports a timeout without an answer", async () => {
    const result = await runCliRewrite(
      { ...BASE, family: piFamily },
      {
        spawn: async () => ({
          stdout: "",
          stderr: "",
          exitCode: null,
          timedOut: true,
          truncated: false,
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("timeout");
    expect(result.message).toContain(`did not answer within ${Math.round(BASE.timeoutMs / 1000)} s`);
  });

  it("reports empty output when the CLI answered with nothing usable", async () => {
    const result = await runCliRewrite(
      { ...BASE, family: piFamily },
      {
        spawn: async () => ({
          stdout: '{"type":"turn_start"}\n',
          stderr: "",
          exitCode: 0,
          timedOut: false,
          truncated: false,
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("empty_output");
    expect(result.message).toBe('The rewrite CLI "pi" finished without an answer.');
  });

  it("names a silent CLI without exposing its stderr", async () => {
    const result = await runCliRewrite(
      { ...BASE, family: claudeFamily },
      {
        spawn: async () => ({ stdout: "", stderr: "\nNo credentials found\n", exitCode: 0, timedOut: false, truncated: false }),
      },
    );
    expect(result).toEqual({
      ok: false,
      code: "empty_output",
      message: 'The rewrite CLI "claude" finished without an answer and printed nothing.',
    });
  });

  // opencode exits 1 with an empty stderr; the reason is in stdout.
  it("prefers the failure a CLI reports in stdout over its exit code and stderr", async () => {
    const result = await runCliRewrite(
      { ...BASE, family: opencodeFamily },
      {
        spawn: async () => ({
          stdout: `${JSON.stringify({ type: "error", error: { name: "UnknownError", data: { message: "usage limit reached" } } })}\n`,
          stderr: "",
          exitCode: 1,
          timedOut: false,
          truncated: false,
        }),
      },
    );
    expect(result).toEqual({
      ok: false,
      code: "generation_failed",
      message: 'The rewrite CLI "opencode" reported an error. Check CLI authentication and configuration.',
    });
  });

  it("hands a session family to its warm server and spawns nothing", async () => {
    const runs: unknown[] = [];
    const result = await runCliRewrite(
      { ...BASE, thinkingOptionId: "low", family: codexFamily },
      {
        spawn: async () => {
          throw new Error("a session family must not spawn a process");
        },
        codex: {
          run: async (run) => {
            runs.push(run);
            return { ok: true, text: "warm" };
          },
          close: () => undefined,
        },
      },
    );
    expect(result).toEqual({ ok: true, text: "warm" });
    expect(runs).toEqual([
      { model: "m", effort: "low", systemPrompt: "SYSTEM", taskPrompt: "TASK PROMPT", timeoutMs: BASE.timeoutMs },
    ]);
  });

  it("reports a spawn failure instead of throwing", async () => {
    const result = await runCliRewrite(
      { ...BASE, family: piFamily },
      {
        spawn: async () => {
          throw new Error("ENOENT");
        },
      },
    );
    expect(result).toEqual({ ok: false, code: "spawn_failed", message: 'The rewrite CLI "pi" could not start. Check that it is installed and available to the host.' });
  });

  it.each(["spawn", "reported", "exit", "empty"] as const)("does not expose raw %s failure data in the result or trace", async (kind) => {
    const sensitive = "private-draft-7e31 credential-synthetic-72ac";
    const lines: string[] = [];
    const result = await runCliRewrite({ ...BASE, family: claudeFamily }, {
      spawn: async () => {
        if (kind === "spawn") throw new Error(sensitive);
        return {
          stdout: kind === "reported" ? JSON.stringify({ is_error: true, result: sensitive }) : "",
          stderr: sensitive,
          exitCode: kind === "exit" ? 7 : 0,
          timedOut: false,
          truncated: false,
        };
      },
      trace: (message, fields) => lines.push(`${message} ${JSON.stringify(typeof fields === "function" ? fields() : fields)}`),
    });
    expect(result).toMatchObject({ ok: false, code: kind === "spawn" ? "spawn_failed" : kind === "empty" ? "empty_output" : "generation_failed" });
    expect(JSON.stringify(result)).not.toContain(sensitive);
    expect(lines.join("\n")).not.toContain(sensitive);
    if (kind === "exit") expect(result).toMatchObject({ message: 'The rewrite CLI "claude" exited with code 7.' });
  });

  // The scratch dir must not leak when the process could not even start.
  it("removes the scratch directory when the spawn fails", async () => {
    let scratch = "";
    await runCliRewrite(
      { ...BASE, family: piFamily },
      {
        onCwd: (cwd) => {
          scratch = cwd;
        },
        spawn: async () => {
          throw new Error("ENOENT");
        },
      },
    );
    expect(existsSync(scratch)).toBe(false);
  });
});

// claude carries the system prompt in argv; a trace must not print it.
it("keeps the system prompt out of a debug trace", async () => {
  const lines: string[] = [];
  const systemPrompt = 'Rules:\n- keep "literals"\n- never add facts';
  await runCliRewrite(
    { ...BASE, systemPrompt, family: claudeFamily },
    {
      spawn: async () => ({ stdout: "", stderr: "", exitCode: 0, timedOut: false, truncated: false }),
      trace: (message, fields) => lines.push(`${message} ${JSON.stringify(typeof fields === "function" ? fields() : fields)}`),
    },
  );
  const text = lines.join("\n");
  expect(text).toContain(`<system prompt, ${systemPrompt.length} chars>`);
  expect(text).not.toContain("never add facts");
});

describe("spawnCli", () => {
  it("captures stdout, pipes stdin and reports the exit code", async () => {
    const result = await spawnCli({
      command: process.execPath,
      args: ["-e", "process.stdin.pipe(process.stdout)"],
      stdin: "hello",
      env: {},
      cwd: process.cwd(),
      timeoutMs: 10_000,
    });
    expect(result.stdout).toBe("hello");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("adds the invocation's variables to the daemon's environment for this run", async () => {
    const result = await spawnCli({
      command: process.execPath,
      args: ["-e", "process.stdout.write(`${process.env.PK_RUN_ONLY}|${Boolean(process.env.PATH)}`)"],
      stdin: null,
      env: { PK_RUN_ONLY: "yes" },
      cwd: process.cwd(),
      timeoutMs: 10_000,
    });
    expect(result.stdout).toBe("yes|true");
    expect(process.env.PK_RUN_ONLY).toBeUndefined();
  });

  it("captures a non-zero exit without rejecting", async () => {
    const result = await spawnCli({
      command: process.execPath,
      args: ["-e", "process.stderr.write('boom'); process.exit(3)"],
      stdin: null,
      env: {},
      cwd: process.cwd(),
      timeoutMs: 10_000,
    });
    expect(result.stderr).toBe("boom");
    expect(result.exitCode).toBe(3);
  });

  // A timeout must kill the whole tree, not just the direct child, or the run hangs.
  it("kills the process tree on timeout", async () => {
    const started = Date.now();
    const result = await spawnCli({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      stdin: null,
      env: {},
      cwd: process.cwd(),
      timeoutMs: 300,
    });
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("reports a missing binary as a spawn error rather than a crash", async () => {
    const result = await spawnCli({
      command: "prompt-kit-does-not-exist-9f31",
      args: [],
      stdin: null,
      env: {},
      cwd: process.cwd(),
      timeoutMs: 5_000,
    });
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain("prompt-kit-does-not-exist-9f31");
  });
});
