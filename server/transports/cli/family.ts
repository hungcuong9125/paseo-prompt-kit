import { resolveCliFamilyId, type CliFamilyId } from "../../../shared/cli-families.js";

/**
 * The supported CLI families and how each one is invoked headlessly.
 *
 * A family is one CLI binary that can answer a single prompt without a UI. The
 * plugin never speaks a provider API directly: Paseo already runs the provider
 * the user selected, so the same binary the agent runs on is the one PromptKit
 * shells out to. That is why `Current agent model` keeps working unchanged.
 *
 * A `process` family starts one process per rewrite. A `session` family (codex) answers
 * on a long-lived server process, see `codex-sessions.ts`. An `acp` family answers on a
 * long-lived Agent Client Protocol server (cline, hermes, dsh), see `acp-sessions.ts`;
 * ACP has no system-prompt channel, so the rewrite contract travels inside the prompt.
 */

export interface CliInvocation {
  readonly command: string;
  readonly args: readonly string[];
  /** Variables added to the daemon's environment for this run only. */
  readonly env: Readonly<Record<string, string>>;
}

export interface CliRequest {
  /** The model id as the agent snapshot reports it, e.g. `openai/gpt-4.1-mini`. */
  readonly model: string;
  readonly thinkingOptionId: string | null;
  /** Instruction text. Replaces the CLI's own default system prompt where supported. */
  readonly systemPrompt: string;
  /** Absolute path of a file holding the user prompt. Set only for file delivery. */
  readonly promptFilePath: string | null;
  /** Absolute paths of the family's declared scratch files, keyed by file name. */
  readonly scratchFilePaths: Readonly<Record<string, string>>;
}

/** A file the runner writes into the scratch directory before the invocation is built. */
export interface CliScratchFile {
  /** File name inside the scratch directory; also the key in `CliRequest.scratchFilePaths`. */
  readonly name: string;
  /**
   * File content, derived from the request. May read the paths of files declared
   * before it: the runner writes and registers them in declaration order.
   */
  readonly content: (request: CliRequest) => string;
}

export interface ProcessCliFamily {
  readonly kind: "process";
  readonly id: CliFamilyId;
  /**
   * How the user prompt reaches the process. `file` keeps the prompt out of
   * `argv`, so it never appears in `ps`; `stdin` is the same guarantee.
   */
  readonly promptDelivery: "stdin" | "file";
  /** Files written into the scratch directory before `buildInvocation` runs. */
  readonly scratchFiles?: readonly CliScratchFile[];
  buildInvocation(request: CliRequest): CliInvocation;
  /** Extracts the final answer from captured stdout, or null when there is none. */
  parseOutput(stdout: string): string | null;
  /** The failure the CLI itself reports in stdout, or null when it reports none. */
  parseError(stdout: string): string | null;
}

export interface SessionCliFamily {
  readonly kind: "session";
  readonly id: CliFamilyId;
}

export interface AcpCliFamily {
  readonly kind: "acp";
  readonly id: CliFamilyId;
  /** Command and args that start the CLI's ACP server over stdio. */
  readonly command: string;
  readonly args: readonly string[];
}

export type CliFamily = ProcessCliFamily | SessionCliFamily | AcpCliFamily;

/** The agent every inline-agent family configures for the rewrite run only. */
const INLINE_AGENT = "promptkit-rewrite";

/** The value `pick` finds in the last event of a JSONL stream that has one. */
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

/** Reported when a model stopped at its output limit; the partial text is never a rewrite. */
export const TRUNCATED_MESSAGE = "The model stopped at its output token limit before the rewrite was complete.";

/** A provider error often arrives as JSON text; its innermost `message` is the readable part. */
export function innermostMessage(text: string): string {
  let current = text;
  for (let depth = 0; depth < 3; depth += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(current);
    } catch {
      return current;
    }
    const nested = at(parsed, "error", "message") ?? at(parsed, "message");
    if (typeof nested !== "string" || nested.trim() === "") return current;
    current = nested;
  }
  return current;
}

function at(value: unknown, ...path: readonly string[]): unknown {
  let current = value;
  for (const step of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[step];
  }
  return current;
}

/** Parses the whole stdout from its first `{`, or null when there is no JSON object. */
function jsonObject<T extends object>(stdout: string): T | null {
  const start = stdout.indexOf("{");
  if (start === -1) return null;
  try {
    const parsed: unknown = JSON.parse(stdout.slice(start));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/**
 * The result envelope a Claude-protocol CLI prints: a single JSON object, or a
 * JSON array whose last element is the result (qwen, codebuddy buffer their
 * whole session into one array).
 */
interface ResultEnvelope {
  result?: unknown;
  is_error?: unknown;
  subtype?: unknown;
  stop_reason?: unknown;
}

function resultEnvelope(stdout: string): ResultEnvelope | null {
  const trimmed = stdout.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (let index = parsed.length - 1; index >= 0; index -= 1) {
          const element = parsed[index];
          if (element !== null && typeof element === "object") return element as ResultEnvelope;
        }
      }
    } catch {
      // Not a JSON array after all; a bracket-prefixed line may still hold the
      // result object, which the object path recovers below.
    }
  }
  return jsonObject<ResultEnvelope>(stdout);
}

/** The failure a result envelope reports, or null for a finished answer. */
function envelopeFailure(parsed: ResultEnvelope, label: string): string | null {
  if (parsed.stop_reason === "max_tokens") return TRUNCATED_MESSAGE;
  const subtype = typeof parsed.subtype === "string" ? parsed.subtype : "";
  if (parsed.is_error !== true && !subtype.startsWith("error")) return null;
  if (typeof parsed.result === "string" && parsed.result.trim() !== "") return parsed.result;
  return subtype === "" ? `${label} reported an error.` : `${label} reported an error (${subtype}).`;
}

/** Envelope answer for a family that reads `result`; null on any failure shape. */
function envelopeAnswer(parsed: ResultEnvelope | null, label: string): string | null {
  if (parsed === null || envelopeFailure(parsed, label) !== null) return null;
  return typeof parsed.result === "string" ? parsed.result : null;
}

/** Joins the text blocks of a pi message object, ignoring thinking blocks. */
function piMessageText(message: unknown): string | null {
  if (message === null || typeof message !== "object" || !("content" in message)) return null;
  const content = message.content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const typed = block as { type?: unknown; text?: unknown };
    if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
  }
  return parts.length === 0 ? null : parts.join("\n");
}

/** The last pi-style turn's answer, ignoring thinking blocks (pi, omp). */
function piTurnText(stdout: string): string | null {
  return lastJsonlText(stdout, (event) => (event.type === "turn_end" ? piMessageText(event.message) : null));
}

// In json mode pi exits 0 after a failed request; the turn's stopReason is the only signal.
function piTurnError(stdout: string): string | null {
  return lastJsonlText(stdout, (event) => {
    if (event.type !== "turn_end") return null;
    const reason = at(event, "message", "stopReason");
    if (reason === "length") return TRUNCATED_MESSAGE;
    if (reason !== "error" && reason !== "aborted") return null;
    const message = at(event, "message", "errorMessage");
    return typeof message === "string" && message.trim() !== "" ? innermostMessage(message) : `Request ${reason}.`;
  });
}

/**
 * The instruction becomes the prompt of an inline agent with every tool off,
 * layered onto the user's config for this run only (opencode, kilo, mimo).
 */
function inlineAgentConfig(systemPrompt: string): string {
  return JSON.stringify({ agent: { [INLINE_AGENT]: { mode: "primary", prompt: systemPrompt, tools: { "*": false } } } });
}

/** The last text event of an opencode-shaped JSONL stream (opencode, kilo, mimo). */
function agentTextEvent(stdout: string): string | null {
  return lastJsonlText(stdout, (event) => {
    if (event.type !== "text" || !("part" in event)) return null;
    // opencode nests the payload under `part`, not at the event root.
    const part = event.part;
    if (part === null || typeof part !== "object" || !("text" in part)) return null;
    const text = part.text;
    return typeof text === "string" ? text : null;
  });
}

/** The error event of an opencode-shaped stream, whose stderr stays empty. */
function agentErrorEvent(stdout: string, label: string): string | null {
  return lastJsonlText(stdout, (event) => {
    if (event.type !== "error") return null;
    const error = event.error;
    if (typeof error === "string" && error.trim() !== "") return innermostMessage(error);
    const message = at(error, "data", "message") ?? at(error, "message");
    if (typeof message === "string" && message.trim() !== "") return innermostMessage(message);
    const name = at(error, "name");
    return typeof name === "string" ? name : `${label} reported an error.`;
  });
}

export const piFamily: ProcessCliFamily = {
  kind: "process",
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
    return { command: "pi", args, env: {} };
  },
  parseOutput: piTurnText,
  parseError: piTurnError,
};

export const claudeFamily: ProcessCliFamily = {
  kind: "process",
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
      "--tools",
      "",
      "--disallowedTools",
      "*",
      // The user's MCP servers, hooks and skills only slow a cold start toward the host's 30 s cap.
      "--strict-mcp-config",
      "--settings",
      JSON.stringify({ disableAllHooks: true }),
      "--disable-slash-commands",
      "--no-session-persistence",
      "--output-format",
      "json",
    ];
    return { command: "claude", args, env: {} };
  },
  parseOutput: (stdout) => envelopeAnswer(resultEnvelope(stdout), "Claude"),
  // An auth or API failure still prints a result object, flagged `is_error` or an
  // `error_*` subtype, whose `result` is the error text rather than an answer.
  parseError: (stdout) => {
    const parsed = resultEnvelope(stdout);
    return parsed === null ? null : envelopeFailure(parsed, "Claude");
  },
};

/** codex answers on a warm `codex app-server`; see `codex-sessions.ts`. */
export const codexFamily: SessionCliFamily = { kind: "session", id: "codex" };

export const opencodeFamily: ProcessCliFamily = {
  kind: "process",
  id: "opencode",
  promptDelivery: "stdin",
  buildInvocation: (request) => {
    const args = ["run", "--model", request.model, "--agent", INLINE_AGENT, "--format", "json"];
    if (request.thinkingOptionId !== null) args.push("--variant", request.thinkingOptionId);
    return { command: "opencode", args, env: { OPENCODE_CONFIG_CONTENT: inlineAgentConfig(request.systemPrompt) } };
  },
  parseOutput: agentTextEvent,
  // opencode exits 1 with an empty stderr; the failure is an `error` event in stdout.
  parseError: (stdout) => agentErrorEvent(stdout, "opencode"),
};

/** A policy file that removes every tool from the model's view (gemini policy engine). */
const GEMINI_DENY_TOOLS = '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n';

interface GeminiOutput {
  response?: unknown;
  error?: unknown;
}

export const geminiFamily: ProcessCliFamily = {
  kind: "process",
  id: "gemini",
  promptDelivery: "stdin",
  scratchFiles: [
    { name: "system-prompt.md", content: (request) => request.systemPrompt },
    { name: "deny-tools.toml", content: () => GEMINI_DENY_TOOLS },
  ],
  buildInvocation: (request) => {
    const systemPromptPath = request.scratchFilePaths["system-prompt.md"];
    const policyPath = request.scratchFilePaths["deny-tools.toml"];
    if (systemPromptPath === undefined || policyPath === undefined) {
      throw new Error("gemini requires its declared scratch files");
    }
    const args = [
      // Headless is triggered by the non-TTY stdin this runner already provides.
      "--model",
      request.model,
      "--output-format",
      "json",
      // A global deny removes every tool from the model's view entirely; the
      // supplemental admin tier outranks the user's own policies.
      "--admin-policy",
      policyPath,
      "--skip-trust",
    ];
    return { command: "gemini", args, env: { GEMINI_SYSTEM_MD: systemPromptPath } };
  },
  parseOutput: (stdout) => {
    const parsed = jsonObject<GeminiOutput>(stdout);
    if (parsed === null || parsed.error !== undefined) return null;
    return typeof parsed.response === "string" ? parsed.response : null;
  },
  // The error object's documented field is `message`; anything else fails closed.
  parseError: (stdout) => {
    const parsed = jsonObject<GeminiOutput>(stdout);
    if (parsed === null || parsed.error === undefined) return null;
    if (typeof parsed.error === "string" && parsed.error.trim() !== "") return innermostMessage(parsed.error);
    const message = at(parsed.error, "message");
    if (typeof message === "string" && message.trim() !== "") return innermostMessage(message);
    return "Gemini CLI reported an error.";
  },
};

export const qwenFamily: ProcessCliFamily = {
  kind: "process",
  id: "qwen",
  promptDelivery: "stdin",
  buildInvocation: (request) => {
    const args = [
      "--model",
      request.model,
      // Replaces Qwen Code's built-in main-session prompt for this run.
      "--system-prompt",
      request.systemPrompt,
      "--output-format",
      "json",
      // No context files, hooks, extensions, skills, MCP servers or memory.
      "--safe-mode",
      // Zero tool calls may execute for this run.
      "--max-tool-calls",
      "0",
    ];
    return { command: "qwen", args, env: {} };
  },
  parseOutput: (stdout) => envelopeAnswer(resultEnvelope(stdout), "Qwen"),
  parseError: (stdout) => {
    const parsed = resultEnvelope(stdout);
    return parsed === null ? null : envelopeFailure(parsed, "Qwen");
  },
};

export const codebuddyFamily: ProcessCliFamily = {
  kind: "process",
  id: "codebuddy",
  promptDelivery: "stdin",
  buildInvocation: (request) => {
    const args = [
      "-p",
      "--model",
      request.model,
      "--system-prompt",
      request.systemPrompt,
      "--tools",
      "",
      "--disallowedTools",
      "*",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--output-format",
      "json",
    ];
    return { command: "codebuddy", args, env: {} };
  },
  // CodeBuddy buffers the whole session into one JSON array; the result is its last element.
  parseOutput: (stdout) => envelopeAnswer(resultEnvelope(stdout), "CodeBuddy"),
  parseError: (stdout) => {
    const parsed = resultEnvelope(stdout);
    return parsed === null ? null : envelopeFailure(parsed, "CodeBuddy");
  },
};

export const qoderFamily: ProcessCliFamily = {
  kind: "process",
  id: "qoder",
  promptDelivery: "stdin",
  buildInvocation: (request) => {
    const args = [
      "-p",
      "--model",
      request.model,
      "--system-prompt",
      request.systemPrompt,
      "--tools",
      "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--output-format",
      "json",
    ];
    if (request.thinkingOptionId !== null) args.push("--reasoning-effort", request.thinkingOptionId);
    // The npm package ships the binary under its CLI name, not the provider id.
    return { command: "qodercli", args, env: {} };
  },
  parseOutput: (stdout) => envelopeAnswer(resultEnvelope(stdout), "Qoder"),
  parseError: (stdout) => {
    const parsed = resultEnvelope(stdout);
    return parsed === null ? null : envelopeFailure(parsed, "Qoder");
  },
};

export const ompFamily: ProcessCliFamily = {
  kind: "process",
  id: "omp",
  // oh-my-pi speaks the pi protocol; its probe answered on the same turn events.
  promptDelivery: "file",
  buildInvocation: (request) => {
    const args = [
      "--model",
      request.model,
      "--no-tools",
      "--no-lsp",
      "--no-pty",
      "--no-context-files",
      "--no-skills",
      "--no-extensions",
      "--no-session",
      "--system-prompt",
      request.systemPrompt,
      "--mode",
      "json",
      "-p",
    ];
    if (request.thinkingOptionId !== null) args.push("--thinking", request.thinkingOptionId);
    if (request.promptFilePath === null) {
      throw new Error("omp requires a prompt file");
    }
    args.push(`@${request.promptFilePath}`);
    return { command: "omp", args, env: {} };
  },
  parseOutput: piTurnText,
  parseError: piTurnError,
};

/** The kimi agent file: the rewrite instruction as the whole system prompt, no tools. */
function kimiAgentConfig(systemPromptPath: string): string {
  return `version: 1\nagent:\n  name: ${INLINE_AGENT}\n  system_prompt_path: ${systemPromptPath}\n  tools: []\n`;
}

export const kimiFamily: ProcessCliFamily = {
  kind: "process",
  id: "kimi",
  promptDelivery: "stdin",
  scratchFiles: [
    { name: "system.md", content: (request) => request.systemPrompt },
    // Declared after system.md, so its content can point at that file's path.
    { name: "kimi-agent.yaml", content: (request) => {
      const systemPromptPath = request.scratchFilePaths["system.md"];
      if (systemPromptPath === undefined) throw new Error("kimi requires its declared scratch files");
      return kimiAgentConfig(systemPromptPath);
    } },
  ],
  buildInvocation: (request) => {
    const agentFilePath = request.scratchFilePaths["kimi-agent.yaml"];
    if (agentFilePath === undefined) {
      throw new Error("kimi requires its declared scratch files");
    }
    const args = ["--print", "--model", request.model, "--agent-file", agentFilePath, "--output-format", "stream-json"];
    return { command: "kimi", args, env: {} };
  },
  parseOutput: (stdout) =>
    lastJsonlText(stdout, (event) => (event.role === "assistant" && typeof event.content === "string" ? event.content : null)),
  // Print mode reports failures through exit codes (1 permanent, 75 transient);
  // its stream carries no documented error event, so the runner names the exit.
  parseError: () => null,
};

interface GrokOutput {
  type?: unknown;
  text?: unknown;
  stopReason?: unknown;
  message?: unknown;
}

export const grokFamily: ProcessCliFamily = {
  kind: "process",
  id: "grok",
  promptDelivery: "file",
  buildInvocation: (request) => {
    if (request.promptFilePath === null) {
      throw new Error("grok requires a prompt file");
    }
    const args = [
      "--prompt-file",
      request.promptFilePath,
      "--system-prompt-override",
      request.systemPrompt,
      "--output-format",
      "json",
      "--no-subagents",
      "--disable-web-search",
      "--tools",
      "",
    ];
    if (request.thinkingOptionId !== null) args.push("--reasoning-effort", request.thinkingOptionId);
    return { command: "grok", args, env: {} };
  },
  parseOutput: (stdout) => {
    const parsed = jsonObject<GrokOutput>(stdout);
    if (parsed === null || parsed.type === "error") return null;
    return typeof parsed.text === "string" ? parsed.text : null;
  },
  // Errors arrive as a `type: "error"` event; a finished answer carries `stopReason`.
  parseError: (stdout) => {
    const parsed = jsonObject<GrokOutput>(stdout);
    if (parsed === null) return null;
    if (parsed.type === "error") {
      if (typeof parsed.message === "string" && parsed.message.trim() !== "") return innermostMessage(parsed.message);
      return "Grok reported an error.";
    }
    if (parsed.stopReason === "max_tokens") return TRUNCATED_MESSAGE;
    return null;
  },
};

/** Builds an opencode-fork family: same agent config, renamed env and binary. */
function forkFamily(id: Extract<CliFamilyId, "kilo" | "mimo">, configVar: string): ProcessCliFamily {
  return {
    kind: "process",
    id,
    promptDelivery: "stdin",
    buildInvocation: (request) => {
      const args = ["run", "--pure", "--model", request.model, "--agent", INLINE_AGENT, "--format", "json"];
      if (request.thinkingOptionId !== null) args.push("--variant", request.thinkingOptionId);
      return { command: id, args, env: { [configVar]: inlineAgentConfig(request.systemPrompt) } };
    },
    parseOutput: agentTextEvent,
    parseError: (stdout) => agentErrorEvent(stdout, id),
  };
}

// Both are opencode forks: the probe confirmed stdin, `--pure`, the inline agent
// via their renamed config env (marker-verified on kilo), and the same JSON events.
export const kiloFamily: ProcessCliFamily = forkFamily("kilo", "KILO_CONFIG_CONTENT");
export const mimoFamily: ProcessCliFamily = forkFamily("mimo", "MIMOCODE_CONFIG_CONTENT");

export const clineFamily: AcpCliFamily = { kind: "acp", id: "cline", command: "cline", args: ["--acp"] };
export const hermesFamily: AcpCliFamily = { kind: "acp", id: "hermes", command: "hermes", args: ["acp"] };
export const dshFamily: AcpCliFamily = { kind: "acp", id: "dsh", command: "dsh", args: ["--profile", "acp"] };

const FAMILIES: readonly CliFamily[] = [
  piFamily,
  claudeFamily,
  codexFamily,
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
  clineFamily,
  hermesFamily,
  dshFamily,
];

export function findFamily(familyId: string): CliFamily | null {
  return FAMILIES.find((family) => family.id === familyId) ?? null;
}

export function listFamilyIds(): readonly string[] {
  return FAMILIES.map((family) => family.id);
}

/**
 * The family that runs a Paseo provider. The id rule lives in
 * `shared/cli-families.ts` so the settings screen shows the same answer the
 * daemon acts on; this only attaches the invocation to it.
 */
export function resolveFamily(
  providerId: string,
  providerMap: Readonly<Record<string, string>> = {},
): CliFamily | null {
  const id = resolveCliFamilyId(providerId, providerMap);
  return id === null ? null : findFamily(id);
}
