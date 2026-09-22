import { describe, expect, it } from "vitest";
import { ACTION_SAMPLES } from "../../client/settings/action-samples.js";
import {
  formatPack,
  freeActionId,
  parseCustomAction,
  removeCustomAction,
  storeCustomAction,
} from "../../client/settings/custom-actions.js";
import { MAX_ENABLED_ACTIONS, describeEnabledLimit } from "../../client/actions/enabled.js";
import { actionPackSchema, type ActionPack } from "../../shared/action-registry/schema.js";
import { listActions, resolveAction, summarizeActions } from "../../shared/action-registry/registry.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";

const defaults = promptKitSettingsSchema.parse({});
const sample = ACTION_SAMPLES[0]!.pack;

function pack(id: string, enabledByDefault = true): ActionPack {
  return { ...sample, id, title: id, enabledByDefault };
}

describe("action samples", () => {
  // Fails if a sample the editor offers could not be applied as it stands.
  it("are valid packs with distinct ids, only the bundled copy reusing a bundled id", () => {
    const bundled = new Set(listActions().map((action) => action.id));
    const ids = ACTION_SAMPLES.map((entry) => entry.pack.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of ACTION_SAMPLES) {
      expect(actionPackSchema.safeParse(entry.pack).success).toBe(true);
      // Only the copy of a bundled action starts on its id; the editor renames it on open.
      expect(bundled.has(entry.pack.id)).toBe(entry.key === "general");
    }
  });

  // Fails if a sample reintroduces the third-party framing Core's contract forbids.
  it("never name a user", () => {
    for (const entry of ACTION_SAMPLES) {
      expect(`${entry.pack.system}\n${entry.pack.task}`).not.toMatch(/\buser\b/i);
    }
  });
});

describe("parseCustomAction", () => {
  it("accepts a formatted pack and returns it unchanged", () => {
    expect(parseCustomAction(formatPack(sample), new Set())).toEqual({ ok: true, pack: sample });
  });

  it("names broken JSON, the first schema problem, and a taken id", () => {
    expect(parseCustomAction("{", new Set())).toMatchObject({ ok: false, error: expect.stringContaining("Not valid JSON") });
    const badId = parseCustomAction(JSON.stringify({ ...sample, id: "Bad Id" }), new Set());
    expect(badId).toMatchObject({ ok: false, error: expect.stringContaining('"id"') });
    const taken = parseCustomAction(formatPack(sample), new Set([sample.id]));
    expect(taken).toMatchObject({ ok: false, error: `Another action already uses the id "${sample.id}".` });
  });

  it("picks a free id by suffix", () => {
    expect(freeActionId("plan", new Set())).toBe("plan");
    expect(freeActionId("plan", new Set(["plan", "plan-2"]))).toBe("plan-3");
  });
});

describe("storing custom actions", () => {
  const summaries = (customs: readonly ActionPack[]) => summarizeActions(customs).actions;

  it("adds a pack, and moves its switch when an edit renames it", () => {
    const added = storeCustomAction(defaults, summaries([]), pack("mine"), null);
    expect(added.customActions?.map((entry) => entry.id)).toEqual(["mine"]);

    const current = { ...defaults, customActions: [pack("mine")], actionEnabled: { mine: false } };
    const renamed = storeCustomAction(current, summaries(current.customActions), pack("ours"), "mine");
    expect(renamed.customActions?.map((entry) => entry.id)).toEqual(["ours"]);
    expect(renamed.actionEnabled).toEqual({ ours: false });
  });

  // Fails if adding an action can push the enabled set over the limit.
  it("starts a new action off when the enabled set is full", () => {
    const customs = Array.from({ length: MAX_ENABLED_ACTIONS - 1 }, (_, index) => pack(`c-${index}`));
    const current = { ...defaults, customActions: customs };
    expect(describeEnabledLimit(summaries(customs), current)).toBeNull();
    const added = storeCustomAction(current, summaries(customs), pack("one-more"), null);
    expect(added.actionEnabled).toEqual({ "one-more": false });
    const next = { ...current, ...added };
    expect(describeEnabledLimit(summaries(next.customActions), next)).toBeNull();
  });

  it("removes a pack together with its switch", () => {
    const current = { ...defaults, customActions: [pack("mine")], actionEnabled: { mine: true, general: false } };
    expect(removeCustomAction(current, "mine")).toEqual({ customActions: [], actionEnabled: { general: false } });
  });
});

describe("registry with custom actions", () => {
  // Fails if a custom action does not run through the same registry as the bundled ones.
  it("lists and resolves a custom action after the bundled ones", () => {
    const summary = summarizeActions([pack("mine")]);
    expect(summary.actions.at(-1)).toMatchObject({ id: "mine", custom: true });
    expect(summary.actions.filter((action) => action.custom)).toHaveLength(1);
    expect(resolveAction("mine", [pack("mine")])?.systemPrompt).toBe(sample.system);
    expect(resolveAction("mine")).toBeNull();
  });

  // Fails if a custom action could silently shadow a bundled one.
  it("rejects both sides when a custom action reuses a bundled id", () => {
    const summary = summarizeActions([pack("general")]);
    expect(summary.actions.some((action) => action.id === "general")).toBe(false);
    expect(summary.rejected.map((entry) => entry.reason)).toEqual([
      "duplicate action id: general",
      "duplicate action id: general",
    ]);
  });
});
