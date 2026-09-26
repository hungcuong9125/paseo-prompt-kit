# Template — a `ProcessCliFamily` in `server/transports/cli/family.ts`

A process family starts one CLI process per rewrite. codex is the one `session` family: it
answers on a warm server (`server/transports/cli/codex-sessions.ts`), not through this shape.

```ts
export const myCliFamily: ProcessCliFamily = {
  kind: "process",
  id: "mycli", // add to CLI_FAMILY_IDS (shared/cli-families.ts); also the binary name
  // "stdin" or "file": the prompt NEVER goes through argv (readable via ps).
  promptDelivery: "stdin",
  buildInvocation: (request) => {
    const args = [
      "run",
      "--model", request.model,
      "--system-prompt", request.systemPrompt,
      // Disable anything that could pull the answer away from (prompt, model): tool,
      // context file, session, extension. List this CLI's actual flags.
      "--no-tools",
      "--output", "json",
    ];
    if (request.thinkingOptionId !== null) args.push("--reasoning", request.thinkingOptionId);
    // With promptDelivery "file": args.push(`@${request.promptFilePath}`) and throw if null.
    // `env` is added to the daemon's environment for this run only; `{}` when none is needed.
    return { command: "mycli", args, env: {} };
  },
  // Returns the final answer from stdout, or null ⇒ the runner reports empty_output.
  parseOutput: (stdout) =>
    lastJsonlText(stdout, (event) =>
      event.type === "final" && typeof event.text === "string" ? event.text : null,
    ),
  // The failure the CLI prints in stdout (an auth error object, a failed-turn event, a stop at
  // the output limit ⇒ TRUNCATED_MESSAGE), or null. The runner refuses the run on it before
  // looking at the exit code, so a CLI whose stderr is empty still names the real cause.
  parseError: (stdout) =>
    lastJsonlText(stdout, (event) =>
      event.type === "error" && typeof event.message === "string" ? event.message : null,
    ),
};
```

Add it to `FAMILIES`. Test: `tests/unit/cli-family.test.ts` (no prompt in argv; flags; parser)
and `stdoutFor()` in `tests/server/harness.ts`.
</content>
