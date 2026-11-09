import { describe, expect, it } from "vitest";
import { ACP_FAMILY_IDS, CLI_FAMILY_IDS } from "../../shared/cli-families.js";
import {
  claudeFamily,
  clineFamily,
  codebuddyFamily,
  codexFamily,
  dshFamily,
  findFamily,
  geminiFamily,
  grokFamily,
  hermesFamily,
  kimiFamily,
  kiloFamily,
  listFamilyIds,
  mimoFamily,
  ompFamily,
  opencodeFamily,
  piFamily,
  qoderFamily,
  qwenFamily,
  resolveFamily,
  TRUNCATED_MESSAGE,
  type ProcessCliFamily,
} from "../../server/transports/cli/family.js";

const REQUEST = {
  model: "some-model",
  thinkingOptionId: null as string | null,
  systemPrompt: "SYSTEM",
  promptFilePath: "/scratch/prompt.txt",
  scratchFilePaths: {
    "system-prompt.md": "/scratch/system-prompt.md",
    "deny-tools.toml": "/scratch/deny-tools.toml",
    "system.md": "/scratch/system.md",
    "kimi-agent.yaml": "/scratch/kimi-agent.yaml",
  },
};

const PROCESS_FAMILIES = [
  piFamily,
  claudeFamily,
  opencodeFamily,
  geminiFamily,
  qwenFamily,
  codebuddyFamily,
  qoderFamily,
  ompFamily,
  kimiFamily,
  grokFamily,
  kiloFamily,
  mimoFamily,
];

function argv(family: ProcessCliFamily, overrides: Partial<typeof REQUEST> = {}) {
  const invocation = family.buildInvocation({ ...REQUEST, ...overrides });
  return { command: invocation.command, args: [...invocation.args], env: invocation.env };
}

describe("CLI families", () => {
  it("exposes exactly the sixteen supported families, matching the shared id list", () => {
    expect(listFamilyIds().length).toBe(CLI_FAMILY_IDS.length);
    for (const id of CLI_FAMILY_IDS) expect(findFamily(id)?.id).toBe(id);
    expect([...listFamilyIds()].sort()).toEqual([...CLI_FAMILY_IDS].sort());
  });

  it("looks a family up by its exact id and rejects anything else", () => {
    expect(findFamily("pi")?.id).toBe("pi");
    expect(findFamily("not-a-cli")).toBeNull();
  });

  // The prompt must never reach `argv`, or another user's `ps` can read it.
  it("keeps the prompt out of argv for every process family", () => {
    for (const family of PROCESS_FAMILIES) {
      const { args } = argv(family);
      for (const arg of args) {
        expect(arg).not.toContain("fix the bug");
        expect(arg).not.toContain("<draft>");
      }
    }
  });

  describe("pi", () => {
    it("delivers the prompt by file and disables every ambient context source", () => {
      const { command, args } = argv(piFamily);
      expect(command).toBe("pi");
      expect(args).toContain("@/scratch/prompt.txt");
      expect(args).toEqual(
        expect.arrayContaining([
          "--no-tools",
          "--no-context-files",
          "--no-skills",
          "--no-extensions",
          "--no-prompt-templates",
          "--no-session",
          "--system-prompt",
          "SYSTEM",
          "--mode",
          "json",
        ]),
      );
      expect(piFamily.promptDelivery).toBe("file");
    });

    it("passes the model and the thinking option", () => {
      const { args } = argv(piFamily, { thinkingOptionId: "high" });
      expect(args[args.indexOf("--model") + 1]).toBe("some-model");
      expect(args[args.indexOf("--thinking") + 1]).toBe("high");
    });

    it("reads the text of the final assistant message and ignores thinking", () => {
      const stdout = [
        JSON.stringify({ type: "turn_start" }),
        JSON.stringify({
          type: "turn_end",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "internal" },
              { type: "text", text: "rewritten" },
            ],
          },
        }),
      ].join("\n");
      expect(piFamily.parseOutput(stdout)).toBe("rewritten");
    });

    // pi exits 0 in json mode after a failed request; only the turn says it failed.
    it("reports a failed or cut-off turn instead of an empty answer", () => {
      const turn = (message: Record<string, unknown>) => `${JSON.stringify({ type: "turn_end", message })}\n`;
      const failed = turn({ role: "assistant", content: [], stopReason: "error", errorMessage: "429 rate limited" });
      expect(piFamily.parseError(failed)).toBe("429 rate limited");
      expect(piFamily.parseError(turn({ role: "assistant", content: [], stopReason: "aborted" }))).toBe("Request aborted.");
      expect(piFamily.parseError(turn({ role: "assistant", content: [{ type: "text", text: "half" }], stopReason: "length" }))).toBe(
        TRUNCATED_MESSAGE,
      );
      expect(piFamily.parseError(turn({ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" }))).toBeNull();
    });

    it("returns null when no assistant text is present", () => {
      expect(piFamily.parseOutput('{"type":"turn_start"}\n')).toBeNull();
      expect(piFamily.parseOutput("not json at all")).toBeNull();
    });
  });

  describe("claude", () => {
    it("delivers the prompt by stdin, replaces the system prompt and forbids tools", () => {
      const { command, args } = argv(claudeFamily);
      expect(command).toBe("claude");
      expect(args).toEqual(
        expect.arrayContaining([
          "-p",
          "--system-prompt",
          "SYSTEM",
          "--disallowedTools",
          "*",
          "--output-format",
          "json",
        ]),
      );
      expect(args[args.indexOf("--tools") + 1]).toBe("");
      expect(claudeFamily.promptDelivery).toBe("stdin");
    });

    // The user's MCP servers, hooks and skills load on every cold start and push it past the host's cap.
    it("starts without the user's MCP servers, hooks, skills or a saved session", () => {
      const { args } = argv(claudeFamily);
      expect(args).toEqual(
        expect.arrayContaining(["--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]),
      );
      expect(JSON.parse(args[args.indexOf("--settings") + 1]!)).toEqual({ disableAllHooks: true });
    });

    it("reads the result field of the JSON envelope", () => {
      expect(claudeFamily.parseOutput('{"type":"result","result":"rewritten"}')).toBe("rewritten");
      // The old parser recovered the object from a bracket-prefixed line; parity holds.
      expect(claudeFamily.parseOutput('[hook] {"type":"result","result":"rewritten"}')).toBe("rewritten");
    });

    it("returns null on a non-JSON answer or a missing result", () => {
      expect(claudeFamily.parseOutput("plain text")).toBeNull();
      expect(claudeFamily.parseOutput('{"type":"result"}')).toBeNull();
    });

    // Fails if an auth or API failure is read as the rewritten prompt.
    it("reports an is_error result as a failure, never as an answer", () => {
      const failed = '{"type":"result","is_error":true,"result":"Failed to authenticate: OAuth session expired"}';
      expect(claudeFamily.parseOutput(failed)).toBeNull();
      expect(claudeFamily.parseError(failed)).toBe("Failed to authenticate: OAuth session expired");
      expect(claudeFamily.parseError('{"type":"result","result":"rewritten"}')).toBeNull();
    });

    it("reports an error subtype or a max_tokens stop, never the partial result", () => {
      const subtype = '{"type":"result","subtype":"error_during_execution","is_error":false}';
      expect(claudeFamily.parseOutput(subtype)).toBeNull();
      expect(claudeFamily.parseError(subtype)).toBe("Claude reported an error (error_during_execution).");
      const cut = '{"type":"result","subtype":"success","stop_reason":"max_tokens","result":"half"}';
      expect(claudeFamily.parseOutput(cut)).toBeNull();
      expect(claudeFamily.parseError(cut)).toBe(TRUNCATED_MESSAGE);
    });
  });

  describe("gemini", () => {
    it("points GEMINI_SYSTEM_MD at the scratch file and denies every tool by policy", () => {
      const { command, args, env } = argv(geminiFamily);
      expect(command).toBe("gemini");
      expect(env.GEMINI_SYSTEM_MD).toBe("/scratch/system-prompt.md");
      expect(args).toEqual(
        expect.arrayContaining([
          "--model",
          "some-model",
          "--output-format",
          "json",
          "--admin-policy",
          "/scratch/deny-tools.toml",
          "--skip-trust",
        ]),
      );
      expect(geminiFamily.promptDelivery).toBe("stdin");
    });

    it("declares a scratch file that replaces the prompt and one that denies every tool", () => {
      const files = geminiFamily.scratchFiles ?? [];
      expect(files.map((file) => file.name)).toEqual(["system-prompt.md", "deny-tools.toml"]);
      expect(files[0]!.content({ ...REQUEST, scratchFilePaths: {} })).toBe("SYSTEM");
      expect(files[1]!.content({ ...REQUEST, scratchFilePaths: {} })).toContain('decision = "deny"');
    });

    it("reads the response field of the JSON object", () => {
      expect(geminiFamily.parseOutput('{"response":"rewritten","stats":{}}')).toBe("rewritten");
      expect(geminiFamily.parseOutput("plain text")).toBeNull();
      expect(geminiFamily.parseOutput('{"stats":{}}')).toBeNull();
    });

    it("reports the error object, never a partial response", () => {
      const failed = '{"error":{"message":"API key not valid"}}';
      expect(geminiFamily.parseOutput(failed)).toBeNull();
      expect(geminiFamily.parseError(failed)).toBe("API key not valid");
      expect(geminiFamily.parseError('{"error":"quota exceeded"}')).toBe("quota exceeded");
      expect(geminiFamily.parseError('{"error":{"code":403}}')).toBe("Gemini CLI reported an error.");
      expect(geminiFamily.parseError('{"response":"done"}')).toBeNull();
    });
  });

  describe("qwen", () => {
    it("delivers the prompt by stdin with the replacement system prompt and zero tool calls", () => {
      const { command, args } = argv(qwenFamily);
      expect(command).toBe("qwen");
      expect(args).toEqual(
        expect.arrayContaining([
          "--model",
          "some-model",
          "--system-prompt",
          "SYSTEM",
          "--output-format",
          "json",
          "--safe-mode",
          "--max-tool-calls",
          "0",
        ]),
      );
      expect(qwenFamily.promptDelivery).toBe("stdin");
    });

    it("reads the result element of the buffered session array", () => {
      const stdout = JSON.stringify([
        { type: "system", subtype: "session_start" },
        { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "first" }] } },
        { type: "result", subtype: "success", is_error: false, result: "rewritten" },
      ]);
      expect(qwenFamily.parseOutput(stdout)).toBe("rewritten");
      expect(qwenFamily.parseOutput("[]")).toBeNull();
    });

    it("reports an is_error result as a failure, never as an answer", () => {
      const failed = JSON.stringify([{ type: "result", subtype: "error_during_execution", is_error: true, result: "quota exceeded" }]);
      expect(qwenFamily.parseOutput(failed)).toBeNull();
      expect(qwenFamily.parseError(failed)).toBe("quota exceeded");
      expect(qwenFamily.parseError("[]")).toBeNull();
    });
  });

  describe("codebuddy", () => {
    it("runs one print process with every tool and ambient source off", () => {
      const { command, args } = argv(codebuddyFamily);
      expect(command).toBe("codebuddy");
      expect(args).toEqual(
        expect.arrayContaining([
          "-p",
          "--model",
          "some-model",
          "--system-prompt",
          "SYSTEM",
          "--tools",
          "",
          "--disallowedTools",
          "*",
          "--strict-mcp-config",
          "--no-session-persistence",
          "--output-format",
          "json",
        ]),
      );
      expect(codebuddyFamily.promptDelivery).toBe("stdin");
    });

    // Shape of a real codebuddy probe: a pretty-printed array ending in the result.
    it("reads the result element of the printed array", () => {
      const stdout = JSON.stringify(
        [
          { type: "message", role: "user" },
          { type: "result", subtype: "success", is_error: false, result: "rewritten" },
        ],
        null,
        2,
      );
      expect(codebuddyFamily.parseOutput(stdout)).toBe("rewritten");
    });

    it("reports an is_error result as a failure, never as an answer", () => {
      const failed = JSON.stringify([{ type: "result", subtype: "error_max_turns", is_error: true, result: "stopped early" }]);
      expect(codebuddyFamily.parseOutput(failed)).toBeNull();
      expect(codebuddyFamily.parseError(failed)).toBe("stopped early");
      expect(codebuddyFamily.parseError("[]")).toBeNull();
    });
  });

  describe("qoder", () => {
    it("spawns qodercli with the replacement system prompt and no tools", () => {
      const { command, args } = argv(qoderFamily, { thinkingOptionId: "high" });
      expect(command).toBe("qodercli");
      expect(args).toEqual(
        expect.arrayContaining([
          "-p",
          "--model",
          "some-model",
          "--system-prompt",
          "SYSTEM",
          "--tools",
          "",
          "--strict-mcp-config",
          "--no-session-persistence",
          "--output-format",
          "json",
          "--reasoning-effort",
          "high",
        ]),
      );
      expect(qoderFamily.promptDelivery).toBe("stdin");
    });

    // Shape of a real qoder probe: one result object carrying stop_reason.
    it("reads the single result object", () => {
      const stdout = '{"type":"result","subtype":"success","is_error":false,"result":"rewritten","stop_reason":"end_turn"}';
      expect(qoderFamily.parseOutput(stdout)).toBe("rewritten");
      expect(qoderFamily.parseError(stdout)).toBeNull();
    });

    it("reports an error result or a cut-off answer", () => {
      const failed = '{"type":"result","subtype":"error","is_error":true,"result":"Invalid API Key"}';
      expect(qoderFamily.parseOutput(failed)).toBeNull();
      expect(qoderFamily.parseError(failed)).toBe("Invalid API Key");
      const cut = '{"type":"result","subtype":"success","is_error":false,"result":"half","stop_reason":"max_tokens"}';
      expect(qoderFamily.parseOutput(cut)).toBeNull();
      expect(qoderFamily.parseError(cut)).toBe(TRUNCATED_MESSAGE);
    });
  });

  describe("omp", () => {
    it("delivers the prompt by file and disables every ambient source", () => {
      const { command, args } = argv(ompFamily, { thinkingOptionId: "high" });
      expect(command).toBe("omp");
      expect(args).toContain("@/scratch/prompt.txt");
      expect(args).toEqual(
        expect.arrayContaining([
          "--no-tools",
          "--no-lsp",
          "--no-pty",
          "--no-context-files",
          "--no-skills",
          "--no-extensions",
          "--no-session",
          "--system-prompt",
          "SYSTEM",
          "--mode",
          "json",
          "-p",
          "--thinking",
          "high",
        ]),
      );
      expect(ompFamily.promptDelivery).toBe("file");
    });

    // Shape of a real omp probe: pi's turn events, thinking blocks included.
    it("reads the final assistant text and ignores thinking blocks", () => {
      const stdout = [
        JSON.stringify({ type: "session", version: 3 }),
        JSON.stringify({
          type: "turn_end",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "internal" },
              { type: "text", text: "rewritten" },
            ],
            stopReason: "stop",
          },
        }),
      ].join("\n");
      expect(ompFamily.parseOutput(stdout)).toBe("rewritten");
      expect(ompFamily.parseError(stdout)).toBeNull();
    });

    it("reports a failed turn like pi does", () => {
      const turn = `${JSON.stringify({ type: "turn_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "429" } })}\n`;
      expect(ompFamily.parseError(turn)).toBe("429");
    });
  });

  describe("opencode", () => {
    it("runs the inline agent through OPENCODE_CONFIG_CONTENT", () => {
      const { command, args, env } = argv(opencodeFamily, { thinkingOptionId: "high" });
      expect(command).toBe("opencode");
      expect(args).toEqual(
        expect.arrayContaining(["run", "--model", "some-model", "--agent", "promptkit-rewrite", "--format", "json"]),
      );
      expect(args).not.toContain("--pure");
      expect(args[args.indexOf("--variant") + 1]).toBe("high");
      const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT!);
      expect(config.agent["promptkit-rewrite"]).toEqual({ mode: "primary", prompt: REQUEST.systemPrompt, tools: { "*": false } });
      expect(opencodeFamily.promptDelivery).toBe("stdin");
    });

    it("reads the last text event from the nested part payload", () => {
      const stdout = [
        JSON.stringify({ type: "step_start" }),
        JSON.stringify({ type: "text", part: { type: "text", text: "first" } }),
        JSON.stringify({ type: "text", part: { type: "text", text: "final" } }),
      ].join("\n");
      expect(opencodeFamily.parseOutput(stdout)).toBe("final");
    });

    // Shape of a real opencode 1.18 failure: exit 1, empty stderr, one error event.
    it("reports the error event, since stderr is empty", () => {
      const stdout = `${JSON.stringify({
        type: "error",
        sessionID: "ses_1",
        error: { name: "UnknownError", data: { message: "Unexpected server error." } },
      })}\n`;
      expect(opencodeFamily.parseError(stdout)).toBe("Unexpected server error.");
      expect(opencodeFamily.parseError(`${JSON.stringify({ type: "error", error: { name: "ProviderAuthError" } })}\n`)).toBe(
        "ProviderAuthError",
      );
      expect(opencodeFamily.parseError('{"type":"text","part":{"text":"ok"}}\n')).toBeNull();
    });
  });

  describe("kimi", () => {
    it("loads a scratch agent file that owns the system prompt and forbids tools", () => {
      const { command, args } = argv(kimiFamily);
      expect(command).toBe("kimi");
      expect(args).toEqual(["--print", "--model", "some-model", "--agent-file", "/scratch/kimi-agent.yaml", "--output-format", "stream-json"]);
      expect(kimiFamily.promptDelivery).toBe("stdin");
      const files = kimiFamily.scratchFiles ?? [];
      expect(files.map((file) => file.name)).toEqual(["system.md", "kimi-agent.yaml"]);
      expect(files[0]!.content({ ...REQUEST, scratchFilePaths: {} })).toBe("SYSTEM");
      const yaml = files[1]!.content(REQUEST);
      expect(yaml).toContain("system_prompt_path: /scratch/system.md");
      expect(yaml).toContain("tools: []");
    });

    it("reads the final assistant message of the stream", () => {
      const stdout = [
        JSON.stringify({ role: "assistant", content: "Let me check.", tool_calls: [{ type: "function" }] }),
        JSON.stringify({ role: "tool", content: "listing" }),
        JSON.stringify({ role: "assistant", content: "rewritten" }),
      ].join("\n");
      expect(kimiFamily.parseOutput(stdout)).toBe("rewritten");
      expect(kimiFamily.parseOutput("")).toBeNull();
      // Print mode reports failures through exit codes; its stream has no error event,
      // so parseError is null by contract and the runner names the exit.
      expect(kimiFamily.parseError('{"role":"assistant","content":"text"}')).toBeNull();
    });
  });

  describe("grok", () => {
    it("delivers the prompt by file with the override system prompt and no tools", () => {
      const { command, args } = argv(grokFamily, { thinkingOptionId: "high" });
      expect(command).toBe("grok");
      expect(args).toEqual(
        expect.arrayContaining([
          "--prompt-file",
          "/scratch/prompt.txt",
          "--system-prompt-override",
          "SYSTEM",
          "--output-format",
          "json",
          "--no-subagents",
          "--disable-web-search",
          "--tools",
          "",
          "--reasoning-effort",
          "high",
        ]),
      );
      expect(grokFamily.promptDelivery).toBe("file");
    });

    // Shape of a real grok probe: one object with text and stopReason.
    it("reads the text field of the result object", () => {
      expect(grokFamily.parseOutput('{"text":"rewritten","stopReason":"end_turn"}')).toBe("rewritten");
      expect(grokFamily.parseOutput("plain text")).toBeNull();
    });

    it("reports the error event and a cut-off answer", () => {
      const failed = '{"type":"error","message":"Not signed in. To authenticate without a browser, run:\\n  grok login --device-code"}';
      expect(grokFamily.parseOutput(failed)).toBeNull();
      expect(grokFamily.parseError(failed)).toContain("Not signed in");
      expect(grokFamily.parseError('{"type":"error"}')).toBe("Grok reported an error.");
      const cut = '{"text":"half","stopReason":"max_tokens"}';
      expect(grokFamily.parseOutput(cut)).toBe("half");
      expect(grokFamily.parseError(cut)).toBe(TRUNCATED_MESSAGE);
      expect(grokFamily.parseError('{"text":"done","stopReason":"end_turn"}')).toBeNull();
    });
  });

  describe.each([
    ["kilo", kiloFamily, "KILO_CONFIG_CONTENT"],
    ["mimo", mimoFamily, "MIMOCODE_CONFIG_CONTENT"],
  ] as const)("%s", (_id, family, configVar) => {
    it("runs the inline agent through its own config variable with no plugins", () => {
      const { command, args, env } = argv(family, { thinkingOptionId: "high" });
      expect(command).toBe(_id);
      expect(args).toEqual(
        expect.arrayContaining([
          "run",
          "--pure",
          "--model",
          "some-model",
          "--agent",
          "promptkit-rewrite",
          "--format",
          "json",
          "--variant",
          "high",
        ]),
      );
      const config = JSON.parse(env[configVar]!);
      expect(config.agent["promptkit-rewrite"]).toEqual({ mode: "primary", prompt: "SYSTEM", tools: { "*": false } });
      expect(family.promptDelivery).toBe("stdin");
    });

    it("reads the last text event and reports the error event", () => {
      const stdout = [
        JSON.stringify({ type: "step_start" }),
        JSON.stringify({ type: "text", part: { type: "text", text: "first" } }),
        JSON.stringify({ type: "text", part: { type: "text", text: "final" } }),
      ].join("\n");
      expect(family.parseOutput(stdout)).toBe("final");
      const failed = `${JSON.stringify({ type: "error", error: { name: "UnknownError", data: { message: "Model not found" } } })}\n`;
      expect(family.parseOutput('{"type":"error"}')).toBeNull();
      expect(family.parseError(failed)).toBe("Model not found");
      const plain = `${JSON.stringify({ type: "error", error: "run ended without an assistant message" })}\n`;
      expect(family.parseError(plain)).toBe("run ended without an assistant message");
    });
  });

  // The rewrite contract is the only instruction in play; a family that drops it rewrites freely.
  it("delivers the system prompt to every process family", () => {
    for (const family of PROCESS_FAMILIES) {
      const { args, env } = family.buildInvocation({ ...REQUEST, promptFilePath: "/tmp/p.txt" });
      const carried = [...args, ...Object.values(env)].some((value) => value.includes(REQUEST.systemPrompt));
      const declared = (family.scratchFiles ?? []).some((file) => file.content(REQUEST).includes(REQUEST.systemPrompt));
      expect(carried || declared, family.id).toBe(true);
    }
  });

  // codex runs on a warm app-server (codex-sessions.ts), never as a one-shot process.
  it("runs codex as a session family", () => {
    expect(codexFamily).toEqual({ kind: "session", id: "codex" });
    expect(findFamily("codex")?.kind).toBe("session");
  });

  it("runs cline, hermes and dsh as ACP families", () => {
    expect(clineFamily).toEqual({ kind: "acp", id: "cline", command: "cline", args: ["--acp"] });
    expect(hermesFamily).toEqual({ kind: "acp", id: "hermes", command: "hermes", args: ["acp"] });
    expect(dshFamily).toEqual({ kind: "acp", id: "dsh", command: "dsh", args: ["--profile", "acp"] });
    for (const family of [clineFamily, hermesFamily, dshFamily]) {
      expect(ACP_FAMILY_IDS).toContain(family.id);
      expect(findFamily(family.id)?.kind).toBe("acp");
    }
  });
});

describe("resolveFamily", () => {
  it("resolves a built-in provider id to itself", () => {
    expect(resolveFamily("pi")?.id).toBe("pi");
    expect(resolveFamily("codex")?.id).toBe("codex");
    expect(resolveFamily("gemini")?.id).toBe("gemini");
    expect(resolveFamily("omp")?.id).toBe("omp");
  });

  // Paseo names a custom profile after its role, so the CLI is a segment.
  it("resolves a role-scoped profile id from its CLI segment", () => {
    expect(resolveFamily("pi-custom")?.id).toBe("pi");
    expect(resolveFamily("codex-custom")?.id).toBe("codex");
    expect(resolveFamily("opencode-custom")?.id).toBe("opencode");
    expect(resolveFamily("claude-custom")?.id).toBe("claude");
    expect(resolveFamily("codebuddy-code")?.id).toBe("codebuddy");
    expect(resolveFamily("gemini-custom")?.id).toBe("gemini");
  });

  it("prefers the longest matching id so a prefix cannot steal a family", () => {
    expect(resolveFamily("opencode")?.id).toBe("opencode");
    expect(resolveFamily("opencode-custom")?.id).toBe("opencode");
    // The approved behavior change: dsh claims its own provider instead of pi.
    expect(resolveFamily("dsh")?.id).toBe("dsh");
    expect(resolveFamily("dsh-pi")?.id).toBe("dsh");
    expect(resolveFamily("dsh-acp")?.id).toBe("dsh");
  });

  // A wrong guess would silently run the user's prompt through the wrong CLI.
  it("fails closed on a provider that names no supported CLI", () => {
    expect(resolveFamily("unknown")).toBeNull();
    expect(resolveFamily("unknown-custom")).toBeNull();
    expect(resolveFamily("")).toBeNull();
  });

  it("lets an explicit mapping override the id, and still fails closed on a bad target", () => {
    expect(resolveFamily("gateway", { "gateway": "opencode" })?.id).toBe("opencode");
    expect(resolveFamily("gateway", { "gateway": "gemini" })?.id).toBe("gemini");
    expect(resolveFamily("gateway", { "gateway": "not-a-family" })).toBeNull();
    expect(resolveFamily("unknown", { "unknown": "pi" })?.id).toBe("pi");
  });
});
