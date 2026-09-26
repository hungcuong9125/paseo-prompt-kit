import { describe, expect, it } from "vitest";
import {
  claudeFamily,
  codexFamily,
  findFamily,
  listFamilyIds,
  opencodeFamily,
  piFamily,
  resolveFamily,
  TRUNCATED_MESSAGE,
  type ProcessCliFamily,
} from "../../server/transports/cli/family.js";

const REQUEST = {
  model: "some-model",
  thinkingOptionId: null as string | null,
  systemPrompt: "SYSTEM",
  promptFilePath: "/scratch/prompt.txt",
};

function argv(family: ProcessCliFamily, overrides: Partial<typeof REQUEST> = {}) {
  const invocation = family.buildInvocation({ ...REQUEST, ...overrides });
  return { command: invocation.command, args: [...invocation.args], env: invocation.env };
}

describe("CLI families", () => {
  it("exposes exactly the four supported families", () => {
    expect([...listFamilyIds()].sort()).toEqual(["claude", "codex", "opencode", "pi"]);
  });

  it("looks a family up by its exact id and rejects anything else", () => {
    expect(findFamily("pi")?.id).toBe("pi");
    expect(findFamily("gemini")).toBeNull();
  });

  // The prompt must never reach `argv`, or another user's `ps` can read it.
  it("keeps the prompt out of argv for every process family", () => {
    for (const family of [piFamily, claudeFamily, opencodeFamily]) {
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

  // The rewrite contract is the only instruction in play; a family that drops it rewrites freely.
  it("delivers the system prompt to every process family", () => {
    for (const family of [piFamily, claudeFamily, opencodeFamily]) {
      const { args, env } = family.buildInvocation({ ...REQUEST, promptFilePath: "/tmp/p.txt" });
      const carried = [...args, ...Object.values(env)].some((value) => value.includes(REQUEST.systemPrompt));
      expect(carried, family.id).toBe(true);
    }
  });

  // codex runs on a warm app-server (codex-sessions.ts), never as a one-shot process.
  it("runs codex as a session family", () => {
    expect(codexFamily).toEqual({ kind: "session", id: "codex" });
    expect(findFamily("codex")?.kind).toBe("session");
  });

  describe("opencode", () => {
    it("runs the model through --format json", () => {
      const { command, args } = argv(opencodeFamily, { thinkingOptionId: "high" });
      expect(command).toBe("opencode");
      expect(args).toEqual(
        expect.arrayContaining(["run", "--model", "some-model", "--format", "json"]),
      );
      expect(args[args.indexOf("--variant") + 1]).toBe("high");
      const agent = args[args.indexOf("--agent") + 1]!;
      const config = JSON.parse(argv(opencodeFamily).env.OPENCODE_CONFIG_CONTENT!);
      expect(config.agent[agent]).toEqual({ mode: "primary", prompt: REQUEST.systemPrompt, tools: { "*": false } });
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
});

describe("resolveFamily", () => {
  it("resolves a built-in provider id to itself", () => {
    expect(resolveFamily("pi")?.id).toBe("pi");
    expect(resolveFamily("codex")?.id).toBe("codex");
  });

  // Paseo names a custom profile after its role, so the CLI is a segment.
  it("resolves a role-scoped profile id from its CLI segment", () => {
    expect(resolveFamily("pi-custom")?.id).toBe("pi");
    expect(resolveFamily("codex-custom")?.id).toBe("codex");
    expect(resolveFamily("opencode-custom")?.id).toBe("opencode");
    expect(resolveFamily("claude-custom")?.id).toBe("claude");
  });

  it("prefers the longest matching id so a prefix cannot steal a family", () => {
    expect(resolveFamily("opencode")?.id).toBe("opencode");
    expect(resolveFamily("opencode-custom")?.id).toBe("opencode");
  });

  // A wrong guess would silently run the user's prompt through the wrong CLI.
  it("fails closed on a provider that names no supported CLI", () => {
    expect(resolveFamily("unknown")).toBeNull();
    expect(resolveFamily("unknown")).toBeNull();
    expect(resolveFamily("unknown-custom")).toBeNull();
    expect(resolveFamily("")).toBeNull();
  });

  it("lets an explicit mapping override the id, and still fails closed on a bad target", () => {
    expect(resolveFamily("gateway", { "gateway": "opencode" })?.id).toBe("opencode");
    expect(resolveFamily("gateway", { "gateway": "gemini" })).toBeNull();
    expect(resolveFamily("unknown", { "unknown": "pi" })?.id).toBe("pi");
  });
});
