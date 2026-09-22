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
  });
});
