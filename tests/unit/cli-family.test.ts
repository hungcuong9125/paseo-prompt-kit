import { describe, expect, it } from "vitest";
import {
  claudeFamily,
  codexFamily,
  findFamily,
  listFamilyIds,
  opencodeFamily,
  piFamily,
  resolveFamily,
} from "../../server/transports/cli/family.js";

const REQUEST = {
  model: "some-model",
  thinkingOptionId: null as string | null,
  systemPrompt: "SYSTEM",
  promptFilePath: "/scratch/prompt.txt",
};

function argv(family: typeof piFamily, overrides: Partial<typeof REQUEST> = {}) {
  const invocation = family.buildInvocation({ ...REQUEST, ...overrides });
  return { command: invocation.command, args: [...invocation.args] };
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
  it("keeps the prompt out of argv for every family", () => {
    for (const family of [piFamily, claudeFamily, codexFamily, opencodeFamily]) {
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
      expect(claudeFamily.promptDelivery).toBe("stdin");
    });

    it("reads the result field of the JSON envelope", () => {
      expect(claudeFamily.parseOutput('{"type":"result","result":"rewritten"}')).toBe("rewritten");
    });

    it("returns null on a non-JSON answer or a missing result", () => {
      expect(claudeFamily.parseOutput("plain text")).toBeNull();
      expect(claudeFamily.parseOutput('{"type":"result"}')).toBeNull();
    });
  });

  describe("codex", () => {
    it("runs exec in a read-only sandbox and skips the git check", () => {
      const { command, args } = argv(codexFamily);
      expect(command).toBe("codex");
      expect(args[0]).toBe("exec");
      expect(args).toEqual(
        expect.arrayContaining(["--sandbox", "read-only", "--skip-git-repo-check", "--json"]),
      );
      expect(codexFamily.promptDelivery).toBe("stdin");
    });

    it("reads the last agent_message item", () => {
      const stdout = [
        JSON.stringify({ type: "turn.started" }),
        JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "no" } }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "first" } }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "final" } }),
      ].join("\n");
      expect(codexFamily.parseOutput(stdout)).toBe("final");
    });

    it("returns null when no agent message completed", () => {
      expect(codexFamily.parseOutput('{"type":"turn.completed"}\n')).toBeNull();
    });
  });

  describe("opencode", () => {
    it("runs the model through --format json", () => {
      const { command, args } = argv(opencodeFamily, { thinkingOptionId: "high" });
      expect(command).toBe("opencode");
      expect(args).toEqual(
        expect.arrayContaining(["run", "--model", "some-model", "--format", "json"]),
      );
      expect(args[args.indexOf("--variant") + 1]).toBe("high");
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
  });
});

describe("resolveFamily", () => {
  it("resolves a built-in provider id to itself", () => {
    expect(resolveFamily("pi")?.id).toBe("pi");
    expect(resolveFamily("codex")?.id).toBe("codex");
  });

  // Paseo names a custom profile after its role, so the CLI is a segment.
  it("resolves a role-scoped profile id from its CLI segment", () => {
    expect(resolveFamily("pi-peer")?.id).toBe("pi");
    expect(resolveFamily("codex-lead")?.id).toBe("codex");
    expect(resolveFamily("opencode-review")?.id).toBe("opencode");
    expect(resolveFamily("claude-supervisor")?.id).toBe("claude");
  });

  it("prefers the longest matching id so a prefix cannot steal a family", () => {
    expect(resolveFamily("opencode")?.id).toBe("opencode");
    expect(resolveFamily("opencode-peer")?.id).toBe("opencode");
  });

  // A wrong guess would silently run the user's prompt through the wrong CLI.
  it("fails closed on a provider that names no supported CLI", () => {
    expect(resolveFamily("grok")).toBeNull();
    expect(resolveFamily("grok-peer")).toBeNull();
    expect(resolveFamily("antigravity-supervisor")).toBeNull();
    expect(resolveFamily("")).toBeNull();
  });

  it("lets an explicit mapping override the id, and still fails closed on a bad target", () => {
    expect(resolveFamily("compat-peer", { "compat-peer": "opencode" })?.id).toBe("opencode");
    expect(resolveFamily("compat-peer", { "compat-peer": "gemini" })).toBeNull();
    expect(resolveFamily("grok-peer", { "grok-peer": "pi" })?.id).toBe("pi");
  });
});
