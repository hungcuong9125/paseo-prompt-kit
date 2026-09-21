import type { CliFamilyId } from "../../shared/cli-families.js";

/**
 * The supported CLI families and how each one is invoked headlessly.
 *
 * A family is one CLI binary that can answer a single prompt without a UI. The
 * plugin never speaks a provider API directly: Paseo already runs the provider
 * the user selected, so the same binary the agent runs on is the one PromptKit
 * shells out to. That is why `Current agent model` keeps working unchanged.
 */

export interface CliInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

export interface CliRequest {
  /** The model id as the agent snapshot reports it, e.g. `workbuddy/deepseek-v4.1-flash`. */
  readonly model: string;
  readonly thinkingOptionId: string | null;
  /** Instruction text. Replaces the CLI's own default system prompt where supported. */
  readonly systemPrompt: string;
  /** Absolute path of a file holding the user prompt. Set only for file delivery. */
  readonly promptFilePath: string | null;
}

export interface CliFamily {
  readonly id: CliFamilyId;
  /**
   * How the user prompt reaches the process. `file` keeps the prompt out of
   * `argv`, so it never appears in `ps`; `stdin` is the same guarantee.
   */
  readonly promptDelivery: "stdin" | "file";
  buildInvocation(request: CliRequest): CliInvocation;
  /** Extracts the final answer from captured stdout, or null when there is none. */
  parseOutput(stdout: string): string | null;
}

/** Collects the text parts of a pi/opencode-style JSONL event stream. */
function lastJsonlText(
  stdout: string,
  pick: (event: Record<string, unknown>) => string | null,
): string | null {
  let found: string | null = null;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || !trimmed.startsWith("{")) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (event === null || typeof event !== "object") continue;
    const text = pick(event as Record<string, unknown>);
    if (text !== null && text.trim() !== "") found = text;
  }
  return found;
}

/** Joins the text blocks of a pi message object, ignoring thinking blocks. */
function piMessageText(message: unknown): string | null {
  if (message === null || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const typed = block as { type?: unknown; text?: unknown };
    if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
  }
  return parts.length === 0 ? null : parts.join("\n");
}

export const piFamily: CliFamily = {
  id: "pi",
  promptDelivery: "file",
  buildInvocation: (request) => {
    const args = [
      "--model",
      request.model,
      // A rewrite is a pure text transformation: no tools, no project context,
      // no session file. Each of these removes one way the answer could drift.
      "--no-tools",
      "--no-context-files",
      "--no-skills",
      "--no-extensions",
      "--no-prompt-templates",
      "--no-session",
      "--system-prompt",
      request.systemPrompt,
      "--mode",
      "json",
      "-p",
    ];
    if (request.thinkingOptionId !== null) args.push("--thinking", request.thinkingOptionId);
    if (request.promptFilePath === null) {
      throw new Error("pi requires a prompt file");
    }
    args.push(`@${request.promptFilePath}`);
    return { command: "pi", args };
  },
  parseOutput: (stdout) =>
    lastJsonlText(stdout, (event) =>
      event.type === "turn_end" ? piMessageText(event.message) : null,
    ),
};

export const claudeFamily: CliFamily = {
  id: "claude",
  promptDelivery: "stdin",
  buildInvocation: (request) => {
    const args = [
      "-p",
      "--model",
      request.model,
      // Replaces Claude Code's own coding-agent system prompt outright, so the
      // rewrite instruction is the only instruction in play.
      "--system-prompt",
      request.systemPrompt,
      // No tool use: a rewrite never needs one, and this closes the path where a
      // prompt could steer the model into running a command.
      "--disallowedTools",
      "*",
      "--output-format",
      "json",
    ];
    return { command: "claude", args };
  },
  parseOutput: (stdout) => {
    const start = stdout.indexOf("{");
    if (start === -1) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout.slice(start));
    } catch {
      return null;
    }
    if (parsed === null || typeof parsed !== "object") return null;
    const result = (parsed as { result?: unknown }).result;
    return typeof result === "string" ? result : null;
  },
};

export const codexFamily: CliFamily = {
  id: "codex",
  promptDelivery: "stdin",
  buildInvocation: (request) => {
    const args = [
      "exec",
      "--model",
      request.model,
      // Read-only sandbox: the rewrite cannot write, and no approval prompt can
      // stall a headless run.
      "--sandbox",
      "read-only",
      // The runner executes in a scratch directory, which is not a git repo.
      "--skip-git-repo-check",
      "--json",
    ];
    if (request.thinkingOptionId !== null) {
      args.push("-c", `model_reasoning_effort="${request.thinkingOptionId}"`);
    }
    return { command: "codex", args };
  },
  parseOutput: (stdout) =>
    lastJsonlText(stdout, (event) => {
      if (event.type !== "item.completed") return null;
      const item = event.item;
      if (item === null || typeof item !== "object") return null;
      const typed = item as { type?: unknown; text?: unknown };
      return typed.type === "agent_message" && typeof typed.text === "string" ? typed.text : null;
    }),
};

export const opencodeFamily: CliFamily = {
  id: "opencode",
  promptDelivery: "stdin",
  buildInvocation: (request) => {
    const args = ["run", "--model", request.model, "--format", "json"];
    if (request.thinkingOptionId !== null) args.push("--variant", request.thinkingOptionId);
    return { command: "opencode", args };
  },
  parseOutput: (stdout) =>
    lastJsonlText(stdout, (event) => {
      if (event.type !== "text") return null;
      // opencode nests the payload under `part`, not at the event root.
      const part = event.part;
      if (part === null || typeof part !== "object") return null;
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : null;
    }),
};

const FAMILIES: readonly CliFamily[] = [piFamily, claudeFamily, codexFamily, opencodeFamily];

/** Longest id first, so `opencode` is tested before any shorter prefix would match. */
const FAMILIES_BY_LENGTH = [...FAMILIES].sort((left, right) => right.id.length - left.id.length);

export function findFamily(familyId: string): CliFamily | null {
  return FAMILIES.find((family) => family.id === familyId) ?? null;
}

export function listFamilyIds(): readonly string[] {
  return FAMILIES.map((family) => family.id);
}

/**
 * Resolves a Paseo provider id to the CLI family that runs it.
 *
 * Paseo names a built-in provider after its CLI (`pi`, `codex`) and a custom
 * profile after the role it plays (`pi-peer`, `codex-lead`), so the family is
 * the id itself or its leading segment. An explicit mapping from settings wins,
 * which is the only way to name a profile whose id does not mention its CLI.
 * Nothing falls back to a default: an unknown provider fails closed.
 */
export function resolveFamily(
  providerId: string,
  providerMap: Readonly<Record<string, string>> = {},
): CliFamily | null {
  const mapped = providerMap[providerId];
  if (mapped !== undefined) return findFamily(mapped);
  for (const family of FAMILIES_BY_LENGTH) {
    if (providerId === family.id) return family;
    if (providerId.startsWith(`${family.id}-`) || providerId.endsWith(`-${family.id}`)) {
      return family;
    }
  }
  return null;
}
