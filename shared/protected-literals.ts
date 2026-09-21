/**
 * Protected-literal rules for PromptKit rewrites.
 *
 * Each rule is data: a kind, a regular expression source, which capture group
 * holds the literal, and an optional named shape gate. The extractor is pure so
 * the same rules can be unit-tested and reused by the server validator.
 *
 * A rule whose pattern can also match plain prose carries a `shape`; the literal
 * counts only when that pure predicate accepts it. Freezing prose is as harmful
 * as dropping a literal: a rewrite that rephrases "write tests for login" must
 * not fail because the word "Write" was read as a tool name.
 */
export type ProtectedLiteralKind =
  | "fenced_code"
  | "inline_code"
  | "url"
  | "absolute_path"
  | "relative_path"
  | "filename"
  | "shell_command"
  | "identifier"
  | "model_name"
  | "tool_name";

export type RuleShape = "shell-command-line" | "model-family-name" | "tool-name";

export interface ProtectedLiteralRule {
  kind: ProtectedLiteralKind;
  source: string;
  flags: string;
  /** Capture group holding the literal; 0 means the whole match. */
  capture: number;
  /** Named pure validator applied to a match; a rejected match is not a literal. */
  shape?: RuleShape;
  /** Fixed alternatives for a rule whose vocabulary is a closed list. */
  literals?: readonly string[];
  description: string;
}

export interface ProtectedLiteral {
  kind: ProtectedLiteralKind;
  value: string;
  start: number;
  end: number;
}

const FILE_EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "py",
  "rb",
  "rs",
  "go",
  "java",
  "kt",
  "swift",
  "sh",
  "bash",
  "zsh",
  "yml",
  "yaml",
  "toml",
  "ini",
  "cfg",
  "css",
  "scss",
  "html",
  "xml",
  "sql",
  "txt",
  "env",
  "lock",
] as const;

const SHELL_COMMANDS = [
  "npm",
  "pnpm",
  "yarn",
  "npx",
  "bun",
  "bunx",
  "git",
  "gh",
  "docker",
  "docker-compose",
  "kubectl",
  "helm",
  "make",
  "cargo",
  "go",
  "python",
  "python3",
  "pip",
  "pip3",
  "poetry",
  "uv",
  "node",
  "deno",
  "tsc",
  "vitest",
  "jest",
  "pytest",
  "ruff",
  "eslint",
  "prettier",
  "biome",
  "rg",
  "grep",
  "find",
  "sed",
  "awk",
  "cat",
  "ls",
  "cd",
  "mkdir",
  "rmdir",
  "rm",
  "cp",
  "mv",
  "ln",
  "chmod",
  "chown",
  "ssh",
  "scp",
  "rsync",
  "tar",
  "zip",
  "unzip",
  "curl",
  "wget",
  "brew",
  "apt",
  "apt-get",
  "systemctl",
  "psql",
  "mysql",
  "sqlite3",
  "jq",
  "echo",
  "export",
  "source",
] as const;

/**
 * Commands whose second word is drawn from a closed subcommand vocabulary.
 * A bare `<command> <word>` is a command line only when that word is in the
 * vocabulary: `git status` is a command, `make the login page work again` is not.
 * Commands with open-ended operands (`make`, `cat`, `find`) are absent on purpose.
 */
const COMMAND_SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  git: [
    "add", "am", "apply", "archive", "bisect", "blame", "branch", "bundle", "cat-file",
    "check-ignore", "checkout", "cherry-pick", "clean", "clone", "commit", "config",
    "describe", "diff", "fetch", "format-patch", "fsck", "grep", "help", "init", "log",
    "ls-files", "ls-remote", "ls-tree", "merge", "mv", "notes", "pull", "push", "rebase",
    "reflog", "remote", "reset", "restore", "revert", "rev-parse", "rm", "shortlog",
    "show", "show-ref", "stash", "status", "submodule", "switch", "symbolic-ref", "tag",
    "worktree",
  ],
  npm: [
    "add", "audit", "cache", "ci", "config", "dedupe", "diff", "dist-tag", "doctor", "exec",
    "explain", "fund", "help", "init", "install", "link", "login", "logout", "ls", "outdated",
    "pack", "ping", "pkg", "prefix", "publish", "query", "rebuild", "repo", "restart", "root",
    "run", "sbom", "search", "star", "stop", "team", "test", "token", "uninstall", "unpublish",
    "update", "version", "view", "whoami",
  ],
  pnpm: [
    "add", "audit", "build", "create", "dedupe", "deploy", "dlx", "doctor", "exec", "fetch",
    "import", "init", "install", "licenses", "link", "list", "ls", "outdated", "pack", "patch",
    "prune", "publish", "rebuild", "remove", "root", "run", "setup", "start", "store", "test",
    "unlink", "update", "why",
  ],
  yarn: [
    "add", "audit", "bin", "cache", "config", "create", "dedupe", "dlx", "exec", "explain",
    "import", "info", "init", "install", "link", "list", "node", "pack", "patch", "plugin",
    "policies", "publish", "rebuild", "remove", "run", "set", "stage", "test", "unlink", "up",
    "upgrade", "version", "why", "workspaces",
  ],
  bun: ["add", "build", "create", "init", "install", "link", "pm", "remove", "run", "test", "update", "upgrade", "x"],
  cargo: [
    "add", "bench", "build", "check", "clean", "clippy", "doc", "fetch", "fix", "fmt", "help",
    "init", "install", "locate-project", "login", "metadata", "new", "owner", "package",
    "publish", "remove", "report", "run", "rustc", "rustdoc", "search", "test", "tree",
    "uninstall", "update", "vendor",
  ],
  go: ["build", "clean", "doc", "env", "fix", "fmt", "generate", "get", "install", "list", "mod", "run", "test", "tool", "version", "vet", "work"],
  deno: ["bench", "bundle", "cache", "check", "compile", "doc", "eval", "fmt", "info", "install", "lint", "repl", "run", "task", "test", "uninstall", "upgrade"],
  docker: [
    "attach", "build", "commit", "compose", "container", "cp", "create", "diff", "events",
    "exec", "export", "history", "image", "images", "import", "info", "inspect", "kill", "load",
    "login", "logout", "logs", "manifest", "network", "pause", "plugin", "port", "ps", "pull",
    "push", "rename", "restart", "rm", "rmi", "run", "save", "search", "start", "stats", "stop",
    "swarm", "system", "tag", "top", "unpause", "version", "volume", "wait",
  ],
  "docker-compose": [
    "build", "config", "create", "down", "events", "exec", "images", "kill", "logs", "ls",
    "pause", "port", "ps", "pull", "push", "restart", "rm", "run", "scale", "start", "stop",
    "top", "unpause", "up", "version",
  ],
  kubectl: [
    "annotate", "api-resources", "api-versions", "apply", "attach", "auth", "autoscale",
    "certificate", "cluster-info", "completion", "config", "cordon", "cp", "create", "delete",
    "describe", "diff", "drain", "edit", "exec", "explain", "expose", "get", "kustomize",
    "label", "logs", "options", "patch", "plugin", "port-forward", "proxy", "replace",
    "rollout", "run", "scale", "set", "taint", "top", "uncordon", "version", "wait",
  ],
  helm: [
    "completion", "create", "dependency", "env", "get", "history", "install", "lint", "list",
    "package", "plugin", "pull", "push", "registry", "repo", "rollback", "search", "show",
    "status", "template", "test", "uninstall", "upgrade", "version",
  ],
  gh: [
    "alias", "api", "auth", "browse", "cache", "codespace", "completion", "config", "extension",
    "gist", "issue", "label", "org", "pr", "project", "release", "repo", "run", "search",
    "secret", "ssh-key", "status", "variable", "workflow",
  ],
  brew: [
    "cat", "cleanup", "config", "deps", "doctor", "info", "install", "leaves", "link", "list",
    "outdated", "search", "services", "tap", "uninstall", "unlink", "untap", "update",
    "upgrade", "uses",
  ],
  systemctl: [
    "cat", "daemon-reload", "disable", "enable", "is-active", "is-enabled", "list-unit-files",
    "list-units", "reload", "restart", "show", "start", "status", "stop",
  ],
  pip: ["cache", "check", "config", "download", "freeze", "install", "list", "search", "show", "uninstall", "wheel"],
  pip3: ["cache", "check", "config", "download", "freeze", "install", "list", "search", "show", "uninstall", "wheel"],
  uv: ["add", "build", "init", "lock", "pip", "publish", "python", "remove", "run", "sync", "tool", "tree", "venv"],
  poetry: ["add", "build", "check", "config", "env", "export", "init", "install", "lock", "new", "publish", "remove", "run", "shell", "show", "update", "version"],
  vitest: ["bench", "dev", "init", "list", "migrate", "related", "run", "typecheck", "watch"],
};

// `command` is deliberately absent: as a bare prefix it collides with the English
// compound "command-line", and no enabled daemon provider reports a `command-*` model.
const MODEL_NAME_PREFIXES = [
  "claude",
  "gpt",
  "gemini",
  "llama",
  "mistral",
  "mixtral",
  "qwen",
  "deepseek",
  "grok",
  "sonar",
] as const;

const MODEL_FAMILY_NAMES = ["opus", "sonnet", "haiku", "codex"] as const;

const TOOL_NAMES = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Bash",
  "Glob",
  "Grep",
  "LS",
  "Task",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
] as const;

const TOOL_CONTEXT_WORDS = ["tool", "tools", "toolkit"] as const;

const FENCE_PATTERN = /```[^\n]*\n([\s\S]*?)```/g;
const INLINE_PATTERN = /`([^`\n]+)`/g;

function alternate(alternatives: readonly string[]): string {
  return [...alternatives].sort((left, right) => right.length - left.length).join("|");
}

/** Ranges of the text that are code: fenced bodies and inline spans. */
function codeRanges(text: string): readonly (readonly [number, number])[] {
  const ranges: [number, number][] = [];
  for (const match of text.matchAll(FENCE_PATTERN)) {
    const body = match[1] ?? "";
    const start = match.index + match[0].indexOf(body);
    ranges.push([start, start + body.length]);
  }
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index + 1;
    const end = start + (match[1]?.length ?? 0);
    if (ranges.some(([from, to]) => start >= from && start < to)) continue;
    ranges.push([start, end]);
  }
  return ranges;
}

function isCodeContext(
  ranges: readonly (readonly [number, number])[],
  start: number,
): boolean {
  return ranges.some(([from, to]) => start >= from && start < to);
}

function stripPunctuation(token: string): string {
  return token.replace(/^["'([{]+/, "").replace(/["')\]}.,;:!?]+$/, "");
}

const FLAG_TOKEN = /^-{1,2}[A-Za-z][A-Za-z0-9-]*(=.*)?$/;
const ASSIGNMENT_TOKEN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const PATH_TOKEN = /^[./~]/;
const FILENAME_TOKEN = new RegExp(`^[A-Za-z0-9_@-]+\\.(?:${alternate(FILE_EXTENSIONS)})$`);

/** A token that only a command line, not an English sentence, would carry. */
function isCommandShapedToken(token: string): boolean {
  const candidate = stripPunctuation(token);
  if (candidate === "") return false;
  return (
    FLAG_TOKEN.test(candidate) ||
    ASSIGNMENT_TOKEN.test(candidate) ||
    PATH_TOKEN.test(candidate) ||
    FILENAME_TOKEN.test(candidate)
  );
}

interface ShapeInput {
  text: string;
  matchText: string;
  value: string;
  start: number;
  end: number;
}

const EXPLICIT_PROMPT_PREFIX = /^[ \t]*(?:\$|>)/;

function acceptsShellCommandLine(
  input: ShapeInput,
  ranges: readonly (readonly [number, number])[],
): boolean {
  if (EXPLICIT_PROMPT_PREFIX.test(input.matchText)) return true;
  if (isCodeContext(ranges, input.start)) return true;
  const tokens = input.value.trim().split(/\s+/).filter(Boolean);
  const command = tokens[0];
  if (command === undefined) return false;
  const vocabulary = COMMAND_SUBCOMMANDS[command];
  const second = stripPunctuation(tokens[1] ?? "");
  if (vocabulary && second !== "" && vocabulary.includes(second)) return true;
  return tokens.slice(1).some(isCommandShapedToken);
}

function acceptsModelFamilyName(
  input: ShapeInput,
  ranges: readonly (readonly [number, number])[],
): boolean {
  if (isCodeContext(ranges, input.start)) return true;
  const lineStart = input.text.lastIndexOf("\n", input.start - 1) + 1;
  const line = input.text.slice(lineStart, input.text.indexOf("\n", input.end) === -1
    ? input.text.length
    : input.text.indexOf("\n", input.end));
  const neighbours = `${line.slice(0, input.start - lineStart)} ${line.slice(input.end - lineStart)}`;
  return MODEL_NAME_PREFIXES.some((prefix) =>
    new RegExp(`\\b${prefix}\\b`, "i").test(neighbours),
  );
}

function acceptsToolName(
  input: ShapeInput,
  ranges: readonly (readonly [number, number])[],
): boolean {
  if (isCodeContext(ranges, input.start)) return true;
  const lineStart = input.text.lastIndexOf("\n", input.start - 1) + 1;
  const lineEnd = input.text.indexOf("\n", input.end);
  const line = input.text.slice(lineStart, lineEnd === -1 ? input.text.length : lineEnd);
  return TOOL_CONTEXT_WORDS.some((word) =>
    new RegExp(`\\b${word}\\b`, "i").test(line),
  );
}

const SHAPES: Readonly<
  Record<RuleShape, (input: ShapeInput, ranges: readonly (readonly [number, number])[]) => boolean>
> = {
  "shell-command-line": acceptsShellCommandLine,
  "model-family-name": acceptsModelFamilyName,
  "tool-name": acceptsToolName,
};

export const protectedLiteralRules: readonly ProtectedLiteralRule[] = [
  {
    kind: "fenced_code",
    source: "```[^\\n]*\\n([\\s\\S]*?)```",
    flags: "g",
    capture: 1,
    description: "Fenced code block body",
  },
  {
    kind: "inline_code",
    source: "`([^`\\n]+)`",
    flags: "g",
    capture: 1,
    description: "Inline code span",
  },
  {
    kind: "url",
    source: "https?://[^\\s<>\"'`)\\]]*[A-Za-z0-9/#?&=_+-]",
    flags: "g",
    capture: 0,
    description: "HTTP(S) URL without trailing prose punctuation",
  },
  {
    kind: "absolute_path",
    source:
      "(?<![^\\s(\"'=])((?:[A-Za-z]:\\\\|/)[A-Za-z0-9._@+-]+(?:[\\\\/][A-Za-z0-9._@+-]+)*[A-Za-z0-9_@+-])",
    flags: "gm",
    capture: 1,
    description: "Absolute filesystem path",
  },
  {
    kind: "relative_path",
    source:
      "(?<![^\\s(\"'=])(\\.{1,2}/(?:[A-Za-z0-9._@+-]+/)*[A-Za-z0-9._@+-]*[A-Za-z0-9_@+-])",
    flags: "gm",
    capture: 1,
    description: "Relative filesystem path",
  },
  {
    kind: "filename",
    source: `\\b[A-Za-z0-9_@-]+\\.(?:${alternate(FILE_EXTENSIONS)})\\b`,
    flags: "g",
    capture: 0,
    description: "File name with a known extension",
  },
  {
    kind: "shell_command",
    source: `^[ \\t]*(?:\\$ |> )?((?:${alternate(SHELL_COMMANDS)})\\b[^\\n]*)`,
    flags: "gm",
    capture: 1,
    shape: "shell-command-line",
    description: "Shell command line with a command-like shape",
  },
  {
    kind: "identifier",
    source:
      "\\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\\b|\\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\\b|\\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\\b",
    flags: "g",
    capture: 0,
    description: "Program identifier (camelCase, snake_case, SCREAMING_SNAKE_CASE)",
  },
  {
    kind: "model_name",
    source: `\\b(?:${alternate(MODEL_NAME_PREFIXES)})[-.][A-Za-z0-9][A-Za-z0-9.-]*\\b`,
    flags: "gi",
    capture: 0,
    description: "Model name carrying a known vendor prefix",
  },
  {
    kind: "model_name",
    source: `\\b(?:${alternate(MODEL_FAMILY_NAMES)})\\b`,
    flags: "g",
    capture: 0,
    shape: "model-family-name",
    description: "Bare model family name, only in code or beside a vendor prefix",
  },
  {
    kind: "tool_name",
    literals: TOOL_NAMES,
    source: `\\b(?:${alternate(TOOL_NAMES)})\\b`,
    flags: "g",
    capture: 0,
    shape: "tool-name",
    description: "Agent tool name, only in code or beside the word tool",
  },
];

function rulePattern(rule: ProtectedLiteralRule): RegExp {
  return new RegExp(rule.source, rule.flags);
}

function collectRule(
  rule: ProtectedLiteralRule,
  text: string,
  ranges: readonly (readonly [number, number])[],
): ProtectedLiteral[] {
  const found: ProtectedLiteral[] = [];
  const pattern = rulePattern(rule);
  for (;;) {
    const match = pattern.exec(text);
    if (!match) break;
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    const raw = match[rule.capture];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value.length === 0) continue;
    const start = match.index + match[0].indexOf(raw) + (raw.length - raw.trimStart().length);
    if (rule.shape) {
      const candidate: ShapeInput = {
        text,
        matchText: match[0],
        value,
        start,
        end: start + value.length,
      };
      if (!SHAPES[rule.shape](candidate, ranges)) continue;
    }
    found.push({ kind: rule.kind, value, start, end: start + value.length });
  }
  return found;
}

/** Extracts every protected literal from `text`, deduplicated by kind and value. */
export function extractProtectedLiterals(text: string): ProtectedLiteral[] {
  const found: ProtectedLiteral[] = [];
  const seen = new Set<string>();
  const ranges = codeRanges(text);
  for (const rule of protectedLiteralRules) {
    for (const literal of collectRule(rule, text, ranges)) {
      const key = `${literal.kind}\u0000${literal.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(literal);
    }
  }
  return found.sort(
    (left, right) =>
      left.start - right.start ||
      left.end - right.end ||
      left.kind.localeCompare(right.kind) ||
      left.value.localeCompare(right.value),
  );
}

/** Literals present in `original` and absent from `rewritten`. */
export function findMissingProtectedLiterals(
  original: string,
  rewritten: string,
): ProtectedLiteral[] {
  return extractProtectedLiterals(original).filter(
    (literal) => !rewritten.includes(literal.value),
  );
}
