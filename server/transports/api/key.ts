import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Resolves the key an API endpoint needs, without ever returning it to a caller
 * that could log or serialize it by accident.
 *
 * A key lives in exactly two places, checked in this order:
 *
 * 1. the environment variable named by `apiKeyEnv`. The plugin server runs as a
 *    child of the daemon, so it inherits the daemon's environment. This is the
 *    right source when the daemon was started from a shell.
 * 2. `<secretsDir>/secrets.json`, mode 0600. Needed because Paseo.app launched
 *    from Finder inherits no shell environment, so a key exported in `.zshrc`
 *    never reaches the daemon.
 *
 * It is deliberately *not* a third place: the settings document travels to the
 * client (`settingsRpc.read`), so a key stored there would leave the machine.
 * `apiKeyEnv` holds the name, never the value.
 *
 * Nothing here logs, throws with, or returns a key except `resolveApiKey`, whose
 * result the caller must not put into a message.
 */

export interface SecretsFile {
  readonly version: number;
  readonly apiKeys: Readonly<Record<string, string>>;
}

export type ApiKeyLookupFailure = "no_key_configured" | "missing_key" | "unreadable_secrets";

export type ApiKeyLookup =
  | { readonly ok: true; readonly key: string; readonly source: "env" | "secrets_file" }
  | { readonly ok: false; readonly reason: ApiKeyLookupFailure };

/** `$PASEO_HOME/plugin-settings/prompt-kit`, the directory the daemon stores settings in. */
export function defaultSecretsDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.PASEO_HOME?.trim();
  const root = home === undefined || home === "" ? path.join(homedir(), ".paseo") : home;
  return path.join(root, "plugin-settings", "prompt-kit");
}

export function secretsFilePath(
  secretsDir: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(secretsDir ?? defaultSecretsDir(env), "secrets.json");
}

/**
 * Reads `secrets.json`. A missing file is not an error — it only means this host
 * uses environment variables — but a present yet unreadable or malformed file is
 * reported, because silently ignoring it would turn a typo into `missing_key`
 * and send the user looking in the wrong place.
 */
export async function readSecretsFile(filePath: string): Promise<ApiKeyLookup | SecretsFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ok: false, reason: "no_key_configured" };
    return { ok: false, reason: "unreadable_secrets" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "unreadable_secrets" };
  }
  if (parsed === null || typeof parsed !== "object") {
    return { ok: false, reason: "unreadable_secrets" };
  }
  const apiKeys = (parsed as { apiKeys?: unknown }).apiKeys;
  if (apiKeys === null || typeof apiKeys !== "object") {
    return { ok: false, reason: "unreadable_secrets" };
  }
  const entries: Record<string, string> = {};
  for (const [name, value] of Object.entries(apiKeys as Record<string, unknown>)) {
    if (typeof value === "string") entries[name] = value;
  }
  return { version: 1, apiKeys: entries };
}

function isLookup(value: ApiKeyLookup | SecretsFile): value is ApiKeyLookup {
  return "ok" in value;
}

/**
 * The key for one endpoint, or a reason it is absent.
 *
 * An endpoint with no `apiKeyEnv` needs no key at all: a local server (vLLM,
 * llama.cpp, LM Studio) is a legitimate endpoint. That case returns an empty key
 * rather than failing, and the protocol module decides whether to send a header.
 */
export async function resolveApiKey(input: {
  readonly apiKeyEnv: string;
  readonly secretsDir: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ApiKeyLookup> {
  const name = input.apiKeyEnv.trim();
  if (name === "") return { ok: true, key: "", source: "env" };

  const env = input.env ?? process.env;
  const fromEnv = env[name];
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return { ok: true, key: fromEnv.trim(), source: "env" };
  }

  const secrets = await readSecretsFile(secretsFilePath(input.secretsDir, env));
  if (isLookup(secrets)) {
    if (secrets.ok) return secrets;
    // A missing file only means this host uses environment variables, so the
    // name is what the user must fix: report the key as missing. An unreadable
    // file is a different problem and must keep its own reason, or the user is
    // told to add a key to a file that cannot be parsed.
    return secrets.reason === "unreadable_secrets"
      ? secrets
      : { ok: false, reason: "missing_key" };
  }
  const value = secrets.apiKeys[name];
  if (typeof value === "string" && value.trim() !== "") {
    return { ok: true, key: value.trim(), source: "secrets_file" };
  }
  return { ok: false, reason: "missing_key" };
}
