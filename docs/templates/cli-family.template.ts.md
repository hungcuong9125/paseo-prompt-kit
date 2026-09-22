# Template — một `CliFamily` trong `server/transports/cli/family.ts`

```ts
export const myCliFamily: CliFamily = {
  id: "mycli", // thêm vào CLI_FAMILY_IDS (shared/cli-families.ts); cũng là tên binary
  // "stdin" hoặc "file": prompt KHÔNG BAO GIỜ đi qua argv (ps đọc được).
  promptDelivery: "stdin",
  buildInvocation: (request) => {
    const args = [
      "run",
      "--model", request.model,
      "--system-prompt", request.systemPrompt,
      // Tắt mọi thứ có thể làm answer lệch khỏi (prompt, model): tool, context
      // file, session, extension. Liệt kê cờ thật của CLI này.
      "--no-tools",
      "--output", "json",
    ];
    if (request.thinkingOptionId !== null) args.push("--reasoning", request.thinkingOptionId);
    // Với promptDelivery "file": args.push(`@${request.promptFilePath}`) và throw nếu null.
    return { command: "mycli", args };
  },
  // Trả về câu trả lời cuối cùng từ stdout, hoặc null ⇒ runner báo empty_output.
  parseOutput: (stdout) =>
    lastJsonlText(stdout, (event) =>
      event.type === "final" && typeof event.text === "string" ? event.text : null,
    ),
};
```

Thêm vào `FAMILIES`. Test: `tests/unit/cli-family.test.ts` (argv không chứa prompt; cờ; parser)
và `stdoutFor()` trong `tests/server/harness.ts`.
