import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contribute from "../../index.server.js";
import { runRewrite } from "../../server/rewrite-engine/engine.js";
import { cliStdout, createRewriteHarness, REWRITE_REQUEST, settings } from "../server/harness.js";

interface CapturedLog {
  stream: "stdout" | "stderr";
  args: unknown[];
}

function captureConsole(): { logs: CapturedLog[]; restore: () => void } {
  const logs: CapturedLog[] = [];
  const info = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push({ stream: "stdout", args });
  });
  const error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logs.push({ stream: "stderr", args });
  });
  return {
    logs,
    restore: () => {
      info.mockRestore();
      error.mockRestore();
    },
  };
}

function loggedText(logs: CapturedLog[]): string {
  return logs
    .map((entry) => entry.args.map((arg) => String(arg)).join(" "))
    .join("\n");
}

const MARKER = "PROMPTKIT_LOG_SECRET_MARKER_9f31";
const PROMPT = `${MARKER} sửa lỗi đăng nhập trong /tmp/app/login.ts`;

describe("default logs carry no prompt or output content", () => {
  let captured: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    captured = captureConsole();
  });

  afterEach(() => {
    captured.restore();
  });

  // Fails if a log call ever gains the original prompt or the rewritten text.
  it("logs model fields only, never the prompt on the success path", async () => {
    const harness = createRewriteHarness({
      cliResult: {
        stdout: cliStdout(`Sửa lỗi đăng nhập trong /tmp/app/login.ts. ${MARKER}_OUTPUT`),
      },
    });
    const output = await runRewrite(
      harness.paseo,
      { ...REWRITE_REQUEST, originalPrompt: PROMPT, taskPrompt: PROMPT },
      { settings: await settings(), spawn: harness.spawn },
    );
    expect(output.status).toBe("ok");

    const text = loggedText(captured.logs);
    expect(text).not.toContain(MARKER);
    expect(text).not.toContain("/tmp/app/login.ts");
  });

  // Fails if an error path logs the prompt to help debugging.
  it("logs the error code only, never the prompt on a failure path", async () => {
    const harness = createRewriteHarness({
      cliResult: { stdout: "", timedOut: true, exitCode: null },
    });
    const output = await runRewrite(
      harness.paseo,
      { ...REWRITE_REQUEST, originalPrompt: PROMPT, taskPrompt: PROMPT },
      { settings: await settings(), spawn: harness.spawn },
    );
    expect(output.status).toBe("error");
    expect(loggedText(captured.logs)).not.toContain(MARKER);
  });
});

describe("the registered rewrite handler", () => {
  let captured: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    captured = captureConsole();
  });

  afterEach(() => {
    captured.restore();
  });

  // Fails if index.server.ts starts logging request or response text.
  it("serves the rewrite RPC without writing prompt content to the log", async () => {
    const handlers = new Map<string, (input: never, context: never) => Promise<unknown>>();
    const server = {
      registerSettings: () => undefined,
      handle: (contract: { name: string }, handler: never) => {
        handlers.set(contract.name, handler);
      },
      on: () => () => undefined,
      before: () => () => undefined,
    };
    const harness = createRewriteHarness({
      cliResult: { stdout: cliStdout("Sửa lỗi đăng nhập trong /tmp/app/login.ts.") },
    });
    contribute(server as never, { spawn: harness.spawn });

    const handler = handlers.get("prompt-kit.rewrite");
    expect(handler).toBeDefined();

    const output = await handler!(
      {
        actionId: "general",
        agentId: "agent-1",
        workspaceId: "wks_1",
        originalPrompt: PROMPT,
        settings: await settings(),
      } as never,
      { paseo: harness.paseo } as never,
    );

    expect((output as { status: string }).status).toBe("ok");
    const text = loggedText(captured.logs);
    expect(text).not.toContain(MARKER);
    expect(text).toContain("rewrite success");
    expect(text).toMatch(/durationMs=\d+ modelMs=\d+/);
  });
});

describe("debug log", () => {
  let captured: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    captured = captureConsole();
  });

  afterEach(() => {
    captured.restore();
  });

  const KEY = "gsk_PROMPTKIT_KEY_MARKER_51c2";
  const ENDPOINT = {
    id: "groq",
    label: "Groq",
    protocol: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    keySource: "env",
    apiKeyEnv: "GROQ_API_KEY",
    models: [],
  };

  function registerRewrite(dependencies: Parameters<typeof contribute>[1]) {
    const handlers = new Map<string, (input: never, context: never) => Promise<unknown>>();
    const server = {
      registerSettings: () => undefined,
      handle: (contract: { name: string }, handler: never) => {
        handlers.set(contract.name, handler);
      },
      on: () => () => undefined,
      before: () => () => undefined,
    };
    contribute(server as never, dependencies);
    return handlers.get("prompt-kit.rewrite")!;
  }

  // A 429 like Groq's OTPM refusal: the debug lines must carry the status and rate-limit headers.
  async function run429(debugLog: boolean) {
    const harness = createRewriteHarness({});
    const fetch = (async () =>
      new Response('{"error":{"message":"Request too large"}}', {
        status: 429,
        headers: { "x-ratelimit-limit-tokens": "8000", "retry-after": "7" },
      })) as unknown as typeof globalThis.fetch;
    const handler = registerRewrite({ spawn: harness.spawn, fetch, env: { GROQ_API_KEY: KEY } });
    return handler(
      {
        actionId: "general",
        agentId: "agent-1",
        workspaceId: "wks_1",
        originalPrompt: PROMPT,
        settings: await settings({
          transport: "api",
          apiEndpoints: [ENDPOINT],
          apiEndpointId: "groq",
          apiModel: "qwen/qwen3.8-27b",
          debugLog,
        }),
      } as never,
      { paseo: harness.paseo } as never,
    );
  }

  it("writes only the outcome line when it is off", async () => {
    const output = await run429(false);
    expect((output as { status: string }).status).toBe("error");
    const lines = loggedText(captured.logs).split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("rewrite failed");
    expect(lines[0]).toContain("code=api_http_error");
  });

  it("traces the target, request and response under one request id, never the key", async () => {
    await run429(true);
    const text = loggedText(captured.logs);
    for (const step of ["rewrite start", "target", "api request", "api response", "api body", "rewrite failed"]) {
      expect(text).toContain(`debug ${step} `);
    }
    expect(text).toContain("status=429");
    expect(text).toContain("x-ratelimit-limit-tokens: 8000");
    expect(text).toContain("retry-after: 7");
    expect(text).toContain("Request too large");
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(MARKER);
    const ids = new Set([...text.matchAll(/ request=(\S+)/g)].map((match) => match[1]));
    expect(ids.size).toBe(1);
  });

  it("traces a CLI run with the system prompt reduced to its length", async () => {
    const harness = createRewriteHarness({ cliResult: { stdout: cliStdout("Sửa lỗi đăng nhập.") } });
    const handler = registerRewrite({ spawn: harness.spawn });
    await handler(
      {
        actionId: "general",
        agentId: "agent-1",
        workspaceId: "wks_1",
        originalPrompt: PROMPT,
        settings: await settings({ debugLog: true }),
      } as never,
      { paseo: harness.paseo } as never,
    );
    const text = loggedText(captured.logs);
    expect(text).toContain("debug cli spawn ");
    expect(text).toMatch(/<system prompt, \d+ chars>/);
    expect(text).toContain("debug cli exit ");
    expect(text).toContain("exitCode=0");
    expect(text).not.toContain("You edit a draft message");
  });
});
