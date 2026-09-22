import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ApiKeySource } from "../../../shared/api-protocol.js";

/**
 * Resolves an endpoint's key from the one source it names. No source falls back to
 * another: a key missing where the user said it is, is an error.
 *
 * The settings document never holds a key, because it travels to the client. Nothing
 * here logs, throws with, or returns a key except `resolveApiKey`.
 */

export type ApiKeyLookupFailure =
  | "missing_env"
  | "missing_secrets_file"
  | "missing_secrets_entry"
  | "unreadable_secrets"
  | "invalid_secrets_dir"
  | "no_key_name";

export type ApiKeyLookup =
  | { readonly ok: true; readonly key: string; readonly source: ApiKeySource }
  | { readonly ok: false; readonly reason: ApiKeyLookupFailure };

type SecretsRead =
  | { readonly ok: true; readonly apiKeys: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly reason: "missing_secrets_file" | "unreadable_secrets" };

/** `$PASEO_HOME/plugin-settings/prompt-kit`, the directory the daemon stores settings in. */
export function defaultSecretsDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.PASEO_HOME?.trim();
  const root = home === undefined || home === "" ? path.join(homedir(), ".paseo") : home;
  return path.join(root, "plugin-settings", "prompt-kit");
}

/** Absolute directory for `secretsDir`, `~/` expanded; null when the value is relative. */
export function resolveSecretsDir(
  secretsDir: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (secretsDir === null) return defaultSecretsDir(env);
  const value = secretsDir.trim();
  if (value === "~" || value.startsWith("~/")) return path.join(homedir(), value.slice(1));
  return path.isAbsolute(value) ? value : null;
}

/** Missing and malformed files are distinct reasons, so the message points at the right fix. */
export async function readSecretsFile(filePath: string): Promise<SecretsRead> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { ok: false, reason: code === "ENOENT" ? "missing_secrets_file" : "unreadable_secrets" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "unreadable_secrets" };
  }
  const apiKeys = (parsed as { apiKeys?: unknown } | null)?.apiKeys;
  if (apiKeys === null || typeof apiKeys !== "object") return { ok: false, reason: "unreadable_secrets" };
  const entries: Record<string, string> = {};
  for (const [name, value] of Object.entries(apiKeys as Record<string, unknown>)) {
    if (typeof value === "string") entries[name] = value;
  }
  return { ok: true, apiKeys: entries };
}

/** The key for one endpoint from its own `keySource`, or the reason it is absent. */
export async function resolveApiKey(input: {
  readonly keySource: ApiKeySource;
  readonly apiKeyEnv: string;
  readonly secretsDir: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ApiKeyLookup> {
  if (input.keySource === "none") return { ok: true, key: "", source: "none" };
  const name = input.apiKeyEnv.trim();
  if (name === "") return { ok: false, reason: "no_key_name" };
  const env = input.env ?? process.env;

  if (input.keySource === "env") {
    const value = env[name]?.trim();
    return value ? { ok: true, key: value, source: "env" } : { ok: false, reason: "missing_env" };
  }

  const dir = resolveSecretsDir(input.secretsDir, env);
  if (dir === null) return { ok: false, reason: "invalid_secrets_dir" };
  const secrets = await readSecretsFile(path.join(dir, "secrets.json"));
  if (!secrets.ok) return secrets;
  const value = secrets.apiKeys[name]?.trim();
  return value ? { ok: true, key: value, source: "secrets_file" } : { ok: false, reason: "missing_secrets_entry" };
}
