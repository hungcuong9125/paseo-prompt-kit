import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { anthropicProtocol } from "../../server/api/anthropic.js";
import { geminiProtocol } from "../../server/api/gemini.js";
import { openAiProtocol } from "../../server/api/openai.js";
import { resolveApiKey, secretsFilePath } from "../../server/api/key.js";

const CALL = {
  baseUrl: "https://api.example.com/openai/v1",
  apiKey: "sk-test",
  model: "openai/gpt-oss-20b",
  systemPrompt: "SYSTEM",
  taskPrompt: "TASK",
};

describe("openai protocol", () => {
  it("posts chat completions with the instruction as a system message", () => {
    const request = openAiProtocol.buildRequest(CALL);
    expect(request.url).toBe("https://api.example.com/openai/v1/chat/completions");
    expect(request.headers["authorization"]).toBe("Bearer sk-test");
    const body = JSON.parse(request.body);
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.messages).toEqual([
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "TASK" },
    ]);
    expect(body.stream).toBe(false);
  });

  // OpenAI's newer models require `max_completion_tokens` and reject `max_tokens`,
  // while older compatible endpoints understand only `max_tokens`. Sending
  // neither is the one form every endpoint accepts.
  it("sends no token limit, so every compatible endpoint accepts the body", () => {
    const body = JSON.parse(openAiProtocol.buildRequest(CALL).body);
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBeUndefined();
  });

  // Groq is the same protocol, so only the base URL changes.
  it("works for any OpenAI-compatible base URL without a code change", () => {
    const groq = openAiProtocol.buildRequest({
      ...CALL,
      baseUrl: "https://api.groq.com/openai/v1",
    });
    expect(groq.url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("strips a trailing slash instead of producing a double slash", () => {
    const request = openAiProtocol.buildRequest({ ...CALL, baseUrl: "https://api.example.com/v1/" });
    expect(request.url).toBe("https://api.example.com/v1/chat/completions");
  });

  it("reads the answer from choices[0].message.content", () => {
    const payload = { choices: [{ message: { role: "assistant", content: "rewritten" } }] };
    expect(openAiProtocol.parseResponse(payload)).toBe("rewritten");
  });

  it("returns null when the answer is missing or not a string", () => {
    expect(openAiProtocol.parseResponse({})).toBeNull();
    expect(openAiProtocol.parseResponse({ choices: [] })).toBeNull();
    expect(openAiProtocol.parseResponse({ choices: [{ message: { content: 42 } }] })).toBeNull();
    expect(openAiProtocol.parseResponse(null)).toBeNull();
  });
});

describe("anthropic protocol", () => {
  it("posts messages with the instruction in the system field", () => {
    const request = anthropicProtocol.buildRequest(CALL);
    expect(request.url).toBe("https://api.example.com/openai/v1/v1/messages");
    expect(request.headers["x-api-key"]).toBe("sk-test");
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(request.body);
    expect(body.system).toBe("SYSTEM");
    expect(body.messages).toEqual([{ role: "user", content: "TASK" }]);
    // Anthropic requires max_tokens, unlike the OpenAI protocol.
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it("joins text blocks and ignores thinking blocks", () => {
    const payload = {
      content: [
        { type: "thinking", thinking: "internal" },
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    };
    expect(anthropicProtocol.parseResponse(payload)).toBe("first\nsecond");
  });

  it("returns null when there is no text block", () => {
    expect(anthropicProtocol.parseResponse({ content: [{ type: "thinking" }] })).toBeNull();
    expect(anthropicProtocol.parseResponse({})).toBeNull();
  });
});

describe("gemini protocol", () => {
  it("puts the model in the path and the instruction in systemInstruction", () => {
    const request = geminiProtocol.buildRequest({
      ...CALL,
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-3.7-flash",
    });
    expect(request.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
    );
    expect(request.headers["x-goog-api-key"]).toBe("sk-test");
    const body = JSON.parse(request.body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "SYSTEM" }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "TASK" }] }]);
  });

  // A model id with a slash would otherwise break the path.
  it("encodes a model id that is not path-safe", () => {
    const request = geminiProtocol.buildRequest({ ...CALL, model: "models/gemini-3" });
    expect(request.url).toContain("models%2Fgemini-3:generateContent");
  });

  it("joins the text parts of the first candidate", () => {
    const payload = {
      candidates: [{ content: { parts: [{ text: "one" }, { text: "two" }] } }],
    };
    expect(geminiProtocol.parseResponse(payload)).toBe("onetwo");
  });

  it("returns null when there is no candidate text", () => {
    expect(geminiProtocol.parseResponse({ candidates: [] })).toBeNull();
    expect(geminiProtocol.parseResponse({})).toBeNull();
  });
});

describe("api key resolution", () => {
  const created: string[] = [];

  afterEach(async () => {
    for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  async function secretsDirWith(content: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "prompt-kit-secrets-"));
    created.push(dir);
    await writeFile(path.join(dir, "secrets.json"), content, { mode: 0o600 });
    return dir;
  }

  it("reads the key from the named environment variable first", async () => {
    const dir = await secretsDirWith(JSON.stringify({ apiKeys: { GROQ_API_KEY: "from-file" } }));
    const result = await resolveApiKey({
      apiKeyEnv: "GROQ_API_KEY",
      secretsDir: dir,
      env: { GROQ_API_KEY: "from-env" },
    });
    expect(result).toEqual({ ok: true, key: "from-env", source: "env" });
  });

  it("falls back to secrets.json when the environment has no value", async () => {
    const dir = await secretsDirWith(JSON.stringify({ apiKeys: { GROQ_API_KEY: "from-file" } }));
    const result = await resolveApiKey({ apiKeyEnv: "GROQ_API_KEY", secretsDir: dir, env: {} });
    expect(result).toEqual({ ok: true, key: "from-file", source: "secrets_file" });
  });

  it("treats an endpoint with no key name as needing no key", async () => {
    const result = await resolveApiKey({ apiKeyEnv: "", secretsDir: null, env: {} });
    expect(result).toEqual({ ok: true, key: "", source: "env" });
  });

  // The failure has to be distinguishable: a missing variable and an unreadable
  // file send the user to different places.
  it("reports a missing key when neither source has a value", async () => {
    const result = await resolveApiKey({ apiKeyEnv: "ABSENT_KEY", secretsDir: null, env: {} });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("missing_key");
  });

  it("reports an unreadable secrets file rather than a missing key", async () => {
    const dir = await secretsDirWith("{ this is not json");
    const result = await resolveApiKey({ apiKeyEnv: "GROQ_API_KEY", secretsDir: dir, env: {} });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("missing_key");
  });

  it("ignores a non-string entry instead of sending it as a header", async () => {
    const dir = await secretsDirWith(JSON.stringify({ apiKeys: { GROQ_API_KEY: 12345 } }));
    const result = await resolveApiKey({ apiKeyEnv: "GROQ_API_KEY", secretsDir: dir, env: {} });
    expect(result.ok).toBe(false);
  });

  it("defaults the secrets path under PASEO_HOME and honours an override", () => {
    expect(secretsFilePath(null, { PASEO_HOME: "/tmp/home" })).toBe(
      "/tmp/home/plugin-settings/prompt-kit/secrets.json",
    );
    expect(secretsFilePath("/custom/dir", { PASEO_HOME: "/tmp/home" })).toBe(
      "/custom/dir/secrets.json",
    );
  });
});
