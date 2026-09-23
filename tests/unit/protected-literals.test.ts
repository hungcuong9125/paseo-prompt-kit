import { describe, expect, it } from "vitest";
import {
  extractProtectedLiterals,
  findMissingProtectedLiterals,
  protectedLiteralRules,
} from "../../shared/protected-literals.js";

function valuesOf(text: string): string[] {
  return extractProtectedLiterals(text).map((literal) => literal.value);
}

function kindsOf(text: string): string[] {
  return extractProtectedLiterals(text).map((literal) => literal.kind);
}

const PROSE_LINES = [
  "make the login page work again",
  "find the bug in login and fix it",
  "go through the auth flow",
  "export the report as csv",
  "cat the logs and check",
  "add a command-line flag",
  "write tests for the login flow",
  "task the agent with the refactor",
  "ls of files would help",
  "cd into the project directory and look around",
] as const;

describe("prose is not a protected literal", () => {
  // Fails if `shell_command` loses its `shell-command-line` shape gate.
  it("claims no shell command in an English sentence", () => {
    for (const line of PROSE_LINES) {
      const shellCommands = extractProtectedLiterals(line).filter(
        (literal) => literal.kind === "shell_command",
      );
      expect(shellCommands, line).toEqual([]);
    }
  });

  // Fails if the model-name rule keeps the bare `command` prefix.
  it("does not read a hyphenated English word as a model name", () => {
    expect(kindsOf("add a command-line flag")).not.toContain("model_name");
    expect(valuesOf("add a command-line flag")).not.toContain("command-line");
  });

  // Fails if `tool_name` loses its `tool-name` shape gate.
  it("does not read an English verb as a tool name", () => {
    for (const line of [
      "Read the file first",
      "Edit the config and restart",
      "Task is done",
      "write tests for the login flow",
    ]) {
      expect(kindsOf(line), line).not.toContain("tool_name");
    }
  });

  it("leaves an ordinary English prompt with nothing to protect", () => {
    for (const line of PROSE_LINES) {
      expect(extractProtectedLiterals(line), line).toEqual([]);
    }
  });

  it("does not fail a faithful rephrase of a prose prompt", () => {
    const original = "find the bug in login and fix it";
    const rewritten = "Investigate the login flow, locate the defect, and repair it.";
    expect(findMissingProtectedLiterals(original, rewritten)).toEqual([]);
  });
});

describe("real command lines stay protected", () => {
  // Fails if the shell-command vocabulary or the shape gate stops accepting a
  // known subcommand.
  it("keeps a command with a known subcommand", () => {
    expect(valuesOf("npm run gate")).toContain("npm run gate");
    expect(valuesOf("git -C /x status")).toContain("git -C /x status");
    expect(valuesOf("git status")).toContain("git status");
    expect(valuesOf("npm run typecheck")).toContain("npm run typecheck");
  });

  // Fails if the shape gate drops the explicit prompt prefix.
  it("keeps an explicitly prefixed command", () => {
    expect(valuesOf("$ make build")).toContain("make build");
    expect(valuesOf("> make build")).toContain("make build");
  });

  // Fails if the shape gate drops flag/assignment/path operands.
  it("keeps a command line whose operands are flag or path shaped", () => {
    expect(valuesOf("npm test -- --watch=false")).toContain("npm test -- --watch=false");
    expect(valuesOf("cargo test --locked")).toContain("cargo test --locked");
    expect(valuesOf("node ./scripts/build.mjs")).toContain("node ./scripts/build.mjs");
  });

  // Fails if code context stops short-circuiting the shape gate.
  it("keeps a command inside inline code and inside a fence", () => {
    expect(valuesOf("run `cat file` first")).toContain("cat file");
    const fenced = ["Steps:", "```sh", "make the build", "npm run gate", "```"].join("\n");
    expect(valuesOf(fenced)).toContain("make the build");
    expect(valuesOf(fenced)).toContain("npm run gate");
  });

  it("reports a command the rewrite dropped", () => {
    const missing = findMissingProtectedLiterals("npm run gate", "run the test suite");
    expect(missing.map((literal) => literal.value)).toContain("npm run gate");
  });
});

describe("model and tool names stay protected", () => {
  // Fails if the prefixed model-name rule is removed.
  it("keeps a vendor-prefixed model name", () => {
    for (const model of ["claude-sonnet-5", "gpt-5.6-luna", "deepseek-chat"]) {
      expect(valuesOf(`use ${model}`), model).toContain(model);
    }
  });

  // Fails if the family-name shape gate drops the adjacent-prefix or code case.
  it("keeps a bare family name only beside a prefix or inside code", () => {
    expect(valuesOf("claude opus is fine")).toContain("opus");
    expect(valuesOf("run `opus` now")).toContain("opus");
    expect(valuesOf("compare sonnet and claude-opus-5")).toContain("sonnet");
  });

  // Fails if the family-name shape gate stops rejecting bare prose usage.
  it("does not protect a bare family name in prose", () => {
    expect(valuesOf("the haiku was short")).not.toContain("haiku");
    expect(valuesOf("a codex of rules")).not.toContain("codex");
    expect(valuesOf("switch to sonnet")).not.toContain("sonnet");
  });

  // Fails if the tool-name shape gate stops requiring context.
  it("keeps a tool name beside the word tool or inside code", () => {
    expect(valuesOf("use the Read tool")).toContain("Read");
    expect(valuesOf("run `Bash` here")).toContain("Bash");
  });

  it("reports a model name the rewrite dropped", () => {
    const missing = findMissingProtectedLiterals("use claude-opus-5", "use the strong model");
    expect(missing.map((literal) => literal.value)).toContain("claude-opus-5");
  });
});

describe("literal kinds that are unambiguous", () => {
  it("keeps a URL, an absolute path, a relative path and a filename", () => {
    const prompt =
      "Read /Volumes/DataSSD/HomeWork/app/src/login.ts from https://github.com/foo/bar, plus ./scripts/build.sh.";
    const values = valuesOf(prompt);
    expect(values).toContain("https://github.com/foo/bar");
    expect(values).toContain("/Volumes/DataSSD/HomeWork/app/src/login.ts");
    expect(values).toContain("./scripts/build.sh");
    expect(values).toContain("login.ts");
  });

  it("keeps program identifiers", () => {
    const values = valuesOf("Fix getUserById and refresh_token and MAX_RETRIES.");
    expect(values).toContain("getUserById");
    expect(values).toContain("refresh_token");
    expect(values).toContain("MAX_RETRIES");
  });

  it("reports a dropped literal and nothing when everything survives", () => {
    const original = "Open /tmp/app/main.ts and see https://example.com/spec";
    const missing = findMissingProtectedLiterals(
      original,
      "Open the main file and read the specification.",
    );
    expect(missing.map((literal) => literal.value)).toContain("/tmp/app/main.ts");
    expect(missing.map((literal) => literal.value)).toContain("https://example.com/spec");
    expect(
      findMissingProtectedLiterals(original, "Open /tmp/app/main.ts, then read https://example.com/spec."),
    ).toEqual([]);
  });
});

describe("rule table integrity", () => {
  it("compiles every declared rule and keeps kinds repeatable only by design", () => {
    for (const rule of protectedLiteralRules) {
      expect(() => new RegExp(rule.source, rule.flags), rule.description).not.toThrow();
    }
    const shaped = protectedLiteralRules.filter((rule) => rule.shape !== undefined);
    expect(shaped.length).toBeGreaterThan(0);
  });

  // Fails if a prose-capable rule is added without a shape gate.
  it("gates every rule whose pattern can match prose", () => {
    const proseCapable: string[] = [];
    for (const rule of protectedLiteralRules) {
      const pattern = new RegExp(rule.source, rule.flags.replace("g", ""));
      const matchesProse = PROSE_LINES.some((line) => pattern.test(line));
      if (matchesProse && rule.shape === undefined) proseCapable.push(rule.description);
    }
    expect(proseCapable).toEqual([]);
  });

  it("keeps every declared literal list extractable", () => {
    const declared = protectedLiteralRules.filter(
      (rule) => rule.literals !== undefined && rule.literals.length > 0,
    );
    expect(declared.length).toBeGreaterThan(0);
    for (const rule of declared) {
      const sample = rule.literals!.map((literal) => `use the ${literal} tool`).join(" and ");
      expect(
        extractProtectedLiterals(sample).some((literal) => literal.kind === rule.kind),
        rule.description,
      ).toBe(true);
    }
  });
});
