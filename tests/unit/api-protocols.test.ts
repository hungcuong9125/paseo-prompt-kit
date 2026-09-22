import { homedir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicProtocol } from "../../server/transports/api/anthropic.js";
import { geminiProtocol } from "../../server/transports/api/gemini.js";
import { openAiProtocol } from "../../server/transports/api/openai.js";
import { resolveApiKey, resolveSecretsDir } from "../../server/transports/api/key.js";
import { runApiRewrite, testApiEndpoint } from "../../server/transports/api/runner.js";

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

  // One source per endpoint: a value in the other source must never be used.
  it("reads only the environment when the source is env", async () => {
    const dir = await secretsDirWith(JSON.stringify({ apiKeys: { GROQ_API_KEY: "from-file" } }));
    const hit = await resolveApiKey({ keySource: "env", apiKeyEnv: "GROQ_API_KEY", secretsDir: dir, env: { GROQ_API_KEY: "from-env" } });
    expect(hit).toEqual({ ok: true, key: "from-env", source: "env" });
    const miss = await resolveApiKey({ keySource: "env", apiKeyEnv: "GROQ_API_KEY", secretsDir: dir, env: {} });
    expect(miss).toEqual({ ok: false, reason: "missing_env" });
  });

  it("reads only secrets.json when the source is secrets_file", async () => {
    const dir = await secretsDirWith(JSON.stringify({ apiKeys: { GROQ_API_KEY: "from-file" } }));
    const hit = await resolveApiKey({ keySource: "secrets_file", apiKeyEnv: "GROQ_API_KEY", secretsDir: dir, env: { GROQ_API_KEY: "from-env" } });
    expect(hit).toEqual({ ok: true, key: "from-file", source: "secrets_file" });
    const miss = await resolveApiKey({ keySource: "secrets_file", apiKeyEnv: "OTHER_KEY", secretsDir: dir, env: { OTHER_KEY: "from-env" } });
    expect(miss).toEqual({ ok: false, reason: "missing_secrets_entry" });
  });

  it("sends no key when the source is none, whatever the name says", async () => {
    const result = await resolveApiKey({ keySource: "none", apiKeyEnv: "GROQ_API_KEY", secretsDir: null, env: { GROQ_API_KEY: "x" } });
    expect(result).toEqual({ ok: true, key: "", source: "none" });
  });

  it("refuses a keyed source with no key name", async () => {
    const result = await resolveApiKey({ keySource: "env", apiKeyEnv: " ", secretsDir: null, env: {} });
    expect(result).toEqual({ ok: false, reason: "no_key_name" });
  });

  it("tells a missing secrets.json apart from an unreadable one", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "prompt-kit-secrets-"));
    created.push(empty);
    const missing = await resolveApiKey({ keySource: "secrets_file", apiKeyEnv: "GROQ_API_KEY", secretsDir: empty, env: {} });
    expect(missing).toEqual({ ok: false, reason: "missing_secrets_file" });
    const dir = await secretsDirWith("{ this is not json");
    const broken = await resolveApiKey({ keySource: "secrets_file", apiKeyEnv: "GROQ_API_KEY", secretsDir: dir, env: {} });
    expect(broken).toEqual({ ok: false, reason: "unreadable_secrets" });
  });

  it("refuses a relative secrets directory", async () => {
    const result = await resolveApiKey({ keySource: "secrets_file", apiKeyEnv: "GROQ_API_KEY", secretsDir: "keys", env: {} });
    expect(result).toEqual({ ok: false, reason: "invalid_secrets_dir" });
  });

  // The two failures send the user to different places, so the message a
  // rewrite or a test reports has to say which one happened.
  it("tells the user to fix secrets.json when it cannot be parsed, not to add a key", async () => {
    const dir = await secretsDirWith("{ this is not json");
    const fetch = vi.fn();
    const result = await runApiRewrite(
      {
        endpoint: {
          id: "groq",
          label: "Groq",
          protocol: "openai",
          baseUrl: "https://api.groq.com/openai/v1",
          keySource: "secrets_file",
          apiKeyEnv: "GROQ_API_KEY",
          models: [],
        },
        model: "m",
        systemPrompt: "s",
        taskPrompt: "t",
        timeoutMs: 1000,
        secretsDir: dir,
      },
      { fetch: fetch as unknown as typeof globalThis.fetch, env: {} },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("missing_api_key");
    expect(result.message).toContain("secrets.json exists but could not be read");
    expect(result.message).not.toContain("has no value");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores a non-string entry instead of sending it as a header", async () => {
    const dir = await secretsDirWith(JSON.stringify({ apiKeys: { GROQ_API_KEY: 12345 } }));
    const result = await resolveApiKey({ keySource: "secrets_file", apiKeyEnv: "GROQ_API_KEY", secretsDir: dir, env: {} });
    expect(result).toEqual({ ok: false, reason: "missing_secrets_entry" });
  });

  it("defaults the secrets directory under PASEO_HOME, expands ~/ and keeps an absolute path", () => {
    expect(resolveSecretsDir(null, { PASEO_HOME: "/tmp/home" })).toBe("/tmp/home/plugin-settings/prompt-kit");
    expect(resolveSecretsDir("~/keys", {})).toBe(path.join(homedir(), "keys"));
    expect(resolveSecretsDir("/custom/dir", {})).toBe("/custom/dir");
    expect(resolveSecretsDir("relative/dir", {})).toBeNull();
  });
});

describe("api endpoint test", () => {
  const ENDPOINT = {
    id: "gemini",
    label: "Gemini",
    protocol: "gemini" as const,
    baseUrl: "https://generativelanguage.googleapis.com",
    keySource: "env" as const,
    apiKeyEnv: "GEMINI_API_KEY",
    models: [],
  };

  function stubFetch(response: { status?: number; body?: unknown; reject?: Error }) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const impl = (async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers });
      if (response.reject) throw response.reject;
      const status = response.status ?? 200;
      const body = response.body === undefined ? {} : response.body;
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
      };
    }) as unknown as typeof globalThis.fetch;
    return { impl, calls };
  }

  it("lists the endpoint's models and strips Gemini's name prefix", async () => {
    const { impl, calls } = stubFetch({
      body: { models: [{ name: "models/gemini-2.5-flash" }, { name: "models/gemini-3.7-flash" }] },
    });
    const result = await testApiEndpoint(
      { endpoint: ENDPOINT, secretsDir: null, timeoutMs: 5_000 },
      { fetch: impl, env: { GEMINI_API_KEY: "k" } },
    );
    expect(result).toEqual({ ok: true, models: ["gemini-2.5-flash", "gemini-3.7-flash"] });
    expect(calls[0]?.url).toContain("/v1beta/models");
    expect(calls[0]?.headers["x-goog-api-key"]).toBe("k");
  });

  // The test must fail the same way a rewrite would, or it would give false
  // confidence about a key the rewrite then cannot use.
  it("reports a missing key without making a request", async () => {
    const { impl, calls } = stubFetch({});
    const result = await testApiEndpoint(
      { endpoint: ENDPOINT, secretsDir: null, timeoutMs: 5_000 },
      { fetch: impl, env: {} },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("missing_api_key");
    expect(result.message).toContain("GEMINI_API_KEY");
    expect(calls).toEqual([]);
  });

  it("reports a non-2xx answer with the provider's own text", async () => {
    const { impl } = stubFetch({ status: 401, body: '{"error":{"message":"Invalid API Key"}}' });
    const result = await testApiEndpoint(
      { endpoint: ENDPOINT, secretsDir: null, timeoutMs: 5_000 },
      { fetch: impl, env: { GEMINI_API_KEY: "k" } },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("api_http_error");
    expect(result.message).toContain("401");
  });

  it("reports an unreadable body", async () => {
    const { impl } = stubFetch({ body: "not json" });
    const result = await testApiEndpoint(
      { endpoint: ENDPOINT, secretsDir: null, timeoutMs: 5_000 },
      { fetch: impl, env: { GEMINI_API_KEY: "k" } },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("api_bad_response");
  });

  // An empty list is a pass: the key and URL proved correct, which is the point.
  it("accepts an endpoint that lists no models", async () => {
    const { impl } = stubFetch({ body: { data: [] } });
    const openai = { ...ENDPOINT, protocol: "openai" as const, baseUrl: "https://api.groq.com/openai/v1" };
    const result = await testApiEndpoint(
      { endpoint: openai, secretsDir: null, timeoutMs: 5_000 },
      { fetch: impl, env: { GEMINI_API_KEY: "k" } },
    );
    expect(result).toEqual({ ok: true, models: [] });
  });

  // A keyless local server is a legitimate endpoint, so no key must not fail.
  it("tests a keyless endpoint without a credential header", async () => {
    const { impl, calls } = stubFetch({ body: { data: [{ id: "local-model" }] } });
    const local = { ...ENDPOINT, protocol: "openai" as const, baseUrl: "http://127.0.0.1:1234/v1", keySource: "none" as const, apiKeyEnv: "" };
    const result = await testApiEndpoint(
      { endpoint: local, secretsDir: null, timeoutMs: 5_000 },
      { fetch: impl, env: {} },
    );
    expect(result).toEqual({ ok: true, models: ["local-model"] });
    expect(calls[0]?.headers["authorization"]).toBeUndefined();
  });
});
