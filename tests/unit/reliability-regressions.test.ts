import { expect, it } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runApiRewrite, testApiEndpoint } from "../../server/transports/api/runner.js";
import { apiEndpointSchema } from "../../shared/api-protocol.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";
import { resolveAction, summarizeActions } from "../../shared/action-registry/registry.js";
import { enabledActions } from "../../client/actions/enabled.js";
import { writeApiKey } from "../../server/transports/api/secrets-store.js";
import { validateRewriteOutput } from "../../server/rewrite-engine/output-validator.js";
import { createCodexSessions } from "../../server/transports/cli/codex-sessions.js";

const endpoint = apiEndpointSchema.parse({ id: "probe", label: "Probe", protocol: "openai", baseUrl: "http://127.0.0.1:1/v1", keySource: "none" });
const input = { endpoint, model: "probe", systemPrompt: "rules", taskPrompt: "rewrite", draft: "draft", secretsDir: null, timeoutMs: 1000 };

it("edits one bundled identity with the same effective instructions in list and resolve", () => {
  const values = promptKitSettingsSchema.parse({ actionOverrides: { general: { system: "Custom rules", task: "Custom task" } } });
  const actions = summarizeActions([], values.actionOverrides).actions;
  expect(enabledActions(actions, values).map((action) => action.id)).toEqual(["general"]);
  expect(actions[0]).toMatchObject({ system: "Custom rules", modified: true, custom: false });
  expect(resolveAction("general", [], values.actionOverrides)?.systemPrompt).toBe(actions[0]?.system);
  expect(resolveAction("general", [], {})?.systemPrompt).not.toBe("Custom rules");
});

it("rejects unknown and invalid overrides without bundled fallback", () => {
  expect(() => resolveAction("general", [], { missing: { system: "rules", task: "task" } })).toThrow();
  expect(() => resolveAction("general", [], { general: { system: "", task: "task" } })).toThrow();
});

it("times out real HTTP bodies even when headers arrived on time", async () => {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" }); res.flushHeaders();
    timers.push(setTimeout(() => res.end('{"choices":[{"message":{"content":"late"}}]}'), 500));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing port");
    const local = { ...input, endpoint: { ...endpoint, baseUrl: `http://127.0.0.1:${address.port}` }, timeoutMs: 100 };
    expect(await runApiRewrite(local)).toMatchObject({ ok: false, code: "timeout" });
    expect(await testApiEndpoint(local)).toMatchObject({ ok: false, code: "timeout" });
  } finally {
    timers.forEach(clearTimeout); server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("redacts synthetic credential echoes from errors and trace", async () => {
  const key = "SYNTHETIC_PROBE_CREDENTIAL";
  const logs: unknown[] = [];
  const result = await runApiRewrite({ ...input, endpoint: { ...endpoint, keySource: "env", apiKeyEnv: "PROBE" } }, {
    env: { PROBE: key }, fetch: (async () => new Response(key, { status: 401 })) as typeof fetch,
    trace: (_name, fields) => logs.push(typeof fields === "function" ? fields() : fields),
  });
  expect(result).toMatchObject({ ok: false, code: "api_http_error" });
  expect(JSON.stringify(result)).toContain("[redacted]");
  expect(JSON.stringify([result, logs])).not.toContain(key);
});

it("preserves all concurrent synthetic key writes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "prompt-kit-concurrent-test-"));
  try {
    const results = await Promise.all(Array.from({ length: 8 }, (_, n) => writeApiKey({ secretsDir: dir, name: `PROBE_${n}`, value: `synthetic-${n}` })));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(Object.keys(JSON.parse(await readFile(path.join(dir, "secrets.json"), "utf8")).apiKeys)).toHaveLength(8);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("rejects malformed model lists but accepts explicit empty lists", async () => {
  expect(await testApiEndpoint(input, { fetch: (async () => new Response('{"not":"models"}')) as typeof fetch })).toMatchObject({ code: "api_bad_response" });
  expect(await testApiEndpoint(input, { fetch: (async () => new Response('{"data":[]}')) as typeof fetch })).toEqual({ ok: true, models: [] });
});

it("rejects a Vietnamese preface unless already in the author's draft", () => {
  const output = "Dưới đây là prompt đã được cải thiện:\nSửa chức năng đăng nhập.";
  expect(validateRewriteOutput({ originalPrompt: "sửa chức năng đăng nhập", output }).ok).toBe(false);
  expect(validateRewriteOutput({ originalPrompt: output, output }).ok).toBe(true);
});

it.each(["initialize", "thread/start"])("bounds hanging Codex %s and closes its connection", async (phase) => {
  let reject!: (error: Error) => void;
  let closed = false;
  const sessions = createCodexSessions(() => ({
    request: (method) => method === phase ? new Promise((_resolve, fail) => { reject = fail; }) : Promise.resolve({}),
    notify() {}, onNotification: () => () => {}, onExit() {}, pid: null,
    close() { closed = true; reject?.(new Error("closed")); },
  }));
  expect(await sessions.run({ model: "probe", effort: null, systemPrompt: "rules", taskPrompt: "draft", timeoutMs: 50 })).toMatchObject({ code: "timeout" });
  expect(closed).toBe(true); sessions.close();
});
