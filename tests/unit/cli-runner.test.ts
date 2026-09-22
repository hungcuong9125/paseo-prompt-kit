import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { piFamily, claudeFamily } from "../../server/transports/cli/family.js";
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
    expect(result).toEqual({ ok: false, code: "timeout", message: "The rewrite timed out." });
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
    expect(result).toEqual({ ok: false, code: "spawn_failed", message: "ENOENT" });
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

describe("spawnCli", () => {
  it("captures stdout, pipes stdin and reports the exit code", async () => {
    const result = await spawnCli({
      command: process.execPath,
      args: ["-e", "process.stdin.pipe(process.stdout)"],
      stdin: "hello",
      cwd: process.cwd(),
      timeoutMs: 10_000,
    });
    expect(result.stdout).toBe("hello");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("captures a non-zero exit without rejecting", async () => {
    const result = await spawnCli({
      command: process.execPath,
      args: ["-e", "process.stderr.write('boom'); process.exit(3)"],
      stdin: null,
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
      cwd: process.cwd(),
      timeoutMs: 5_000,
    });
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain("prompt-kit-does-not-exist-9f31");
  });
});
