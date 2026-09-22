import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveSecretsDir } from "./key.js";

/**
 * Writes one `apiKeys` entry of secrets.json on the daemon's machine. Write-only:
 * nothing here returns, logs, or throws with a key value.
 */

export type SecretsStoreResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

type Document = { ok: true; data: Record<string, unknown> & { apiKeys: Record<string, unknown> } } | { ok: false; message: string };

const INVALID_DIR = "The secrets directory must be an absolute path or start with ~/.";

async function readDocument(filePath: string): Promise<Document> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, data: { version: 1, apiKeys: {} } };
    return { ok: false, message: "secrets.json exists but could not be read." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "secrets.json is not valid JSON; fix or remove it before saving a key here." };
  }
  const apiKeys = (parsed as { apiKeys?: unknown } | null)?.apiKeys;
  if (parsed === null || typeof parsed !== "object" || apiKeys === null || typeof apiKeys !== "object") {
    return { ok: false, message: 'secrets.json has no { "apiKeys": { ... } } object; fix it before saving a key here.' };
  }
  return { ok: true, data: parsed as Record<string, unknown> & { apiKeys: Record<string, unknown> } };
}

/** Atomic owner-only write: temp file (0600) then rename, so a failure never leaves half a file. */
async function writeDocument(dir: string, filePath: string, data: unknown): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(dir, `.secrets.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, filePath);
    await chmod(filePath, 0o600);
  } finally {
    await rm(temp, { force: true });
  }
}

/** Sets `name` to `value`, or removes it when `value` is null; every other entry is kept. */
export async function writeApiKey(input: {
  readonly secretsDir: string | null;
  readonly name: string;
  readonly value: string | null;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<SecretsStoreResult> {
  const name = input.name.trim();
  if (name === "") return { ok: false, message: "Enter the key variable first." };
  const dir = resolveSecretsDir(input.secretsDir, input.env ?? process.env);
  if (dir === null) return { ok: false, message: INVALID_DIR };
  const filePath = path.join(dir, "secrets.json");

  const document = await readDocument(filePath);
  if (!document.ok) return document;
  const apiKeys = { ...document.data.apiKeys };
  if (input.value === null) delete apiKeys[name];
  else apiKeys[name] = input.value.trim();
  try {
    await writeDocument(dir, filePath, { ...document.data, apiKeys });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown";
    return { ok: false, message: `Could not write secrets.json (${code}).` };
  }
  return { ok: true };
}

/** Whether secrets.json holds a non-empty string for `name`. Never the value. */
export async function hasApiKey(input: {
  readonly secretsDir: string | null;
  readonly name: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<{ readonly ok: true; readonly stored: boolean } | { readonly ok: false; readonly message: string }> {
  const dir = resolveSecretsDir(input.secretsDir, input.env ?? process.env);
  if (dir === null) return { ok: false, message: INVALID_DIR };
  const document = await readDocument(path.join(dir, "secrets.json"));
  if (!document.ok) return document;
  const value = document.data.apiKeys[input.name.trim()];
  return { ok: true, stored: typeof value === "string" && value.trim() !== "" };
}
