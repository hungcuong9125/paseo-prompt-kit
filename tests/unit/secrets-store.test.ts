import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveApiKey } from "../../server/transports/api/key.js";
import { hasApiKey, writeApiKey } from "../../server/transports/api/secrets-store.js";

const created: string[] = [];

afterEach(async () => {
  for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "prompt-kit-store-"));
  created.push(dir);
  return dir;
}

async function readJson(dir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(dir, "secrets.json"), "utf8")) as Record<string, unknown>;
}

describe("writeApiKey", () => {
  it("creates an owner-only secrets.json the key lookup can read", async () => {
    const dir = path.join(await tempDir(), "nested");
    expect(await writeApiKey({ secretsDir: dir, name: "GROQ_API_KEY", value: " gsk-1 " })).toEqual({ ok: true });
    expect((await stat(path.join(dir, "secrets.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect(await resolveApiKey({ keySource: "secrets_file", apiKeyEnv: "GROQ_API_KEY", secretsDir: dir, env: {} })).toEqual({
      ok: true,
      key: "gsk-1",
      source: "secrets_file",
    });
  });

  it("keeps every other entry and field when it sets or removes one", async () => {
    const dir = await tempDir();
    await writeFile(
      path.join(dir, "secrets.json"),
      JSON.stringify({ version: 1, note: "mine", apiKeys: { OTHER: "keep", GROQ_API_KEY: "old" } }),
    );
    await writeApiKey({ secretsDir: dir, name: "GROQ_API_KEY", value: "new" });
    expect(await readJson(dir)).toEqual({ version: 1, note: "mine", apiKeys: { OTHER: "keep", GROQ_API_KEY: "new" } });

    await writeApiKey({ secretsDir: dir, name: "GROQ_API_KEY", value: null });
    expect(await readJson(dir)).toEqual({ version: 1, note: "mine", apiKeys: { OTHER: "keep" } });
  });

  // Overwriting a malformed file would destroy keys the user can still recover.
  it("refuses to overwrite a malformed secrets.json", async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, "secrets.json"), "{ not json");
    const result = await writeApiKey({ secretsDir: dir, name: "GROQ_API_KEY", value: "x" });
    expect(result.ok).toBe(false);
    expect(await readFile(path.join(dir, "secrets.json"), "utf8")).toBe("{ not json");
  });

  it("refuses a relative directory and an empty name, and never echoes the value", async () => {
    const relative = await writeApiKey({ secretsDir: "keys", name: "K", value: "secret-value" });
    const unnamed = await writeApiKey({ secretsDir: await tempDir(), name: " ", value: "secret-value" });
    for (const result of [relative, unnamed]) {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.message).not.toContain("secret-value");
    }
  });
});

describe("hasApiKey", () => {
  it("answers stored or not, never the value", async () => {
    const dir = await tempDir();
    expect(await hasApiKey({ secretsDir: dir, name: "GROQ_API_KEY" })).toEqual({ ok: true, stored: false });
    await writeApiKey({ secretsDir: dir, name: "GROQ_API_KEY", value: "gsk-1" });
    const result = await hasApiKey({ secretsDir: dir, name: "GROQ_API_KEY" });
    expect(result).toEqual({ ok: true, stored: true });
    expect(JSON.stringify(result)).not.toContain("gsk-1");
  });
});
