import { afterEach, expect, it } from "vitest";
import { createWebComposerAdapter } from "../../client/composer-bridge/web.js";
import { createRewriteRunner } from "../../client/pills/rewrite-runner.js";
import { registerAgentPills } from "../../client/pills/agent-pills.js";
import { createRewriteStatusBus } from "../../client/pills/rewrite-status.js";
import { createFakeClient, mountComposer } from "./fakes.js";
import { summarizeActions } from "../../shared/action-registry/registry.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";

const values = promptKitSettingsSchema.parse({});
const identity = { agentId: "agent-a", workspaceId: "ws-1" };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => document.body.replaceChildren());

it.each(["switch", "reuse"])("refuses a result after Composer identity changes: %s", async (mode) => {
  const original = mountComposer("same draft");
  let finish!: (value: unknown) => void;
  const runner = createRewriteRunner({ adapter: createWebComposerAdapter(identity), rpc: (() => new Promise((resolve) => { finish = resolve; })) as never,
    readSettings: async () => ({ status: "ready", values }), ...identity, isActive: () => true, onStatus() {} });
  const pending = runner.run("general");
  await flush();
  let other = original;
  if (mode === "switch") {
    original.parentElement!.style.display = "none";
    other = mountComposer("same draft", { ...identity, agentId: "agent-b" });
  } else Object.assign(original, { __reactFiber$test: { memoizedProps: { ...identity, agentId: "agent-b" }, return: null } });
  finish({ status: "ok", rewrittenPrompt: "result for A" });
  await expect(pending).rejects.toThrow("changed");
  expect(other.value).toBe("same draft"); expect(original.value).toBe("same draft");
});

it("refuses missing identity evidence instead of selecting the only visible Composer", () => {
  const field = mountComposer("draft");
  delete (field as unknown as Record<string, unknown>).__reactFiber$test;
  expect(createWebComposerAdapter(identity).readText()).toBeNull();
});

it("shares the busy lock between entry points bound to one Composer", () => {
  mountComposer("draft");
  const first = createWebComposerAdapter(identity);
  const stop = first.beginRewriteEffect();
  expect(() => createWebComposerAdapter(identity).beginRewriteEffect()).toThrow("already rewriting");
  stop();
  createWebComposerAdapter(identity).beginRewriteEffect()();
});

it("does not resurrect a removed agent after a delayed settings read", async () => {
  let finish!: (value: unknown) => void;
  const pending = new Promise((resolve) => { finish = resolve; });
  const fake = createFakeClient({ agents: [{ id: identity.agentId, workspaceId: identity.workspaceId }] });
  const stop = registerAgentPills(fake.client, () => ({ run: async () => {} }), {
    readSettings: (() => pending) as never, listActions: async () => summarizeActions([]).actions,
    onSettingsSaved: () => () => {}, statuses: createRewriteStatusBus(),
  });
  await flush(); fake.removeAgent(identity.agentId); finish({ status: "ready", values }); await flush();
  expect(fake.live()).toHaveLength(0); stop();
});

it("lets the server resolve API provider mappings instead of rejecting the unused default model", async () => {
  mountComposer("draft");
  let called = false;
  const runner = createRewriteRunner({ adapter: createWebComposerAdapter(identity), ...identity, isActive: () => true, onStatus() {},
    readSettings: async () => ({ status: "ready", values: promptKitSettingsSchema.parse({ transport: "api", apiEndpointId: "mapped", apiModel: null, apiEndpointByProvider: { pi: "mapped" } }) }),
    rpc: (async () => { called = true; return { status: "ok", rewrittenPrompt: "rewritten" }; }) as never,
  });
  await runner.run("general"); expect(called).toBe(true);
});

it("keeps General as a direct button after its instructions change", async () => {
  const { pillButton } = await import("../../client/pills/agent-pills.js");
  const actions = summarizeActions([], { general: { system: "Custom rules", task: "Rewrite" } }).actions;
  let ran = "";
  const button = pillButton(actions, { run: async (id) => { ran = id; } });
  expect(button.behavior.kind).toBe("action");
  if (button.behavior.kind === "action") await button.behavior.onPress();
  expect(ran).toBe("general");
});
