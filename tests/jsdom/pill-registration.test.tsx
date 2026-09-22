import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => (await import("./mocks.js")).reactNativeMock);
vi.mock(
  "@getpaseo/plugin/client/ui",
  async () => (await import("./mocks.js")).pluginUiMock,
);

import contribute from "../../index.client.js";
import { createFakeClient, unmountComposer, type FakePill } from "./fakes.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const agentA = { id: "agent-a", workspaceId: "ws-1" };
const agentB = { id: "agent-b", workspaceId: "ws-2" };

afterEach(unmountComposer);

function button(pill: FakePill): Record<string, unknown> {
  return pill.button;
}

/** Mounts the plugin with a settings document the test controls. */
async function mountWith(
  settings: Record<string, unknown> = {},
  agents = [agentA, agentB],
) {
  const values = promptKitSettingsSchema.parse(settings);
  const fake = createFakeClient({
    agents,
    rpc: async (method) => {
      if (method === "settings.prompt-kit.read") {
        return { status: "ready", revision: "r1", values };
      }
      throw new Error(`unexpected rpc ${method}`);
    },
  });
  const cleanup = contribute(fake.client);
  await flush();
  return { fake, cleanup };
}

describe("composer pill registration", () => {
  it("registers exactly one pill per live agent with the agent's workspace and id", async () => {
    const { fake, cleanup } = await mountWith();

    const live = fake.live();
    expect(live).toHaveLength(2);
    expect(live.map((pill) => [pill.workspaceId, pill.agentId]).sort()).toEqual([
      ["ws-1", "agent-a"],
      ["ws-2", "agent-b"],
    ]);
    expect(new Set(live.map((pill) => pill.id))).toEqual(new Set(["prompt-kit"]));
    cleanup();
  });

  it("adds a pill for an agent that appears later and drops it when the agent goes away", async () => {
    const { fake, cleanup } = await mountWith({}, [agentA]);
    expect(fake.live().map((pill) => pill.agentId)).toEqual(["agent-a"]);

    fake.upsert(agentB);
    await flush();
    expect(fake.live().map((pill) => pill.agentId).sort()).toEqual(["agent-a", "agent-b"]);

    fake.removeAgent("agent-a");
    expect(fake.live().map((pill) => pill.agentId)).toEqual(["agent-b"]);

    fake.upsert({ ...agentB, archivedAt: "2026-09-21T00:00:00.000Z" });
    await flush();
    expect(fake.live()).toHaveLength(0);
    cleanup();
  });

  it("removes every registration on cleanup so a reload never duplicates a pill", async () => {
    const { fake, cleanup } = await mountWith();
    expect(fake.live()).toHaveLength(2);

    cleanup();
    expect(fake.live()).toHaveLength(0);

    const second = contribute(fake.client);
    await flush();
    expect(fake.live()).toHaveLength(2);
    second();
    expect(fake.live()).toHaveLength(0);
  });

  it("registers the settings screen once", async () => {
    const { fake, cleanup } = await mountWith({}, []);
    expect(fake.screens.map((screen) => screen.id)).toEqual(["prompt-kit"]);
    cleanup();
  });
});

describe("pill shape follows the enabled set E", () => {
  it("is a direct action button when exactly one action is enabled", async () => {
    const { fake, cleanup } = await mountWith();
    const pill = fake.live()[0]!;
    const behavior = button(pill).behavior as { kind: string; onPress(): void };
    expect(behavior.kind).toBe("action");
    expect(typeof behavior.onPress).toBe("function");
    // The button advertises the action itself, not a generic menu.
    expect(button(pill).title).toBe("Improve coding prompt");
    cleanup();
  });

  it("shows the plugin's own icon, the same one the settings title uses", async () => {
    // The pill and the settings screen name the same plugin, so they must not
    // show two different icons for it. The pill used to take the first action's
    // icon, which read as a different plugin from the one in the settings header.
    const { fake, cleanup } = await mountWith();
    const { PLUGIN_ICON } = await import("../../client/icon.js");
    const pill = fake.live()[0]!;
    expect(button(pill).icon).toBe(PLUGIN_ICON);
    expect(fake.screens[0]?.icon).toBe(PLUGIN_ICON);
    cleanup();
  });

  it("hides the pill when every action is disabled", async () => {
    const { fake, cleanup } = await mountWith({ actionEnabled: { coding: false } });
    expect(fake.live()).toHaveLength(0);
    cleanup();
  });

  it("falls back to the pack default for an id the settings document does not name", async () => {
    const { fake, cleanup } = await mountWith({ actionEnabled: { "not-a-pack": true } });
    expect(fake.live()).toHaveLength(2);
    cleanup();
  });

  it("registers no pill when the settings document cannot be read", async () => {
    const fake = createFakeClient({
      agents: [agentA],
      settingsError: new Error("settings offline"),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cleanup = contribute(fake.client);
    await flush();
    expect(fake.live()).toHaveLength(0);
    expect(error).toHaveBeenCalled();
    cleanup();
    error.mockRestore();
  });

  it("registers no pill when the action registry cannot be read", async () => {
    const fake = createFakeClient({
      agents: [agentA],
      actionsError: new Error("registry offline"),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cleanup = contribute(fake.client);
    await flush();
    expect(fake.live()).toHaveLength(0);
    expect(error).toHaveBeenCalled();
    cleanup();
    error.mockRestore();
  });
});

describe("settings changes are not observed live (SDK 0.8.0 limitation)", () => {
  it("does not rebuild a pill when the settings document changes underneath", async () => {
    // `PluginClientContext` exposes no settings subscription for code outside the
    // React tree, so the enabled set is read once per registration. This test
    // pins that limitation: a toggle takes effect on the next agent mount or
    // plugin reload, and the pill must never silently re-shape itself.
    let values = promptKitSettingsSchema.parse({});
    const fake = createFakeClient({
      agents: [agentA],
      rpc: async (method) => {
        if (method === "settings.prompt-kit.read") {
          return { status: "ready", revision: "r1", values };
        }
        throw new Error(`unexpected rpc ${method}`);
      },
    });
    const cleanup = contribute(fake.client);
    await flush();
    const before = button(fake.live()[0]!);
    expect((before.behavior as { kind: string }).kind).toBe("action");

    // The user disables the action; nothing pushes that into the pill.
    values = promptKitSettingsSchema.parse({ actionEnabled: { coding: false } });
    fake.upsert({ ...agentA });
    await flush();

    expect(fake.live()).toHaveLength(1);
    expect(button(fake.live()[0]!).behavior).toEqual(before.behavior);
    cleanup();
  });
});

describe("registry read economy", () => {
  it("reads the action registry once for a directory of many agents", async () => {
    // The registry is fixed for the life of a registration; issuing one RPC per
    // agent would make a large directory quadratic on the daemon.
    const agents = Array.from({ length: 5 }, (_, index) => ({
      id: `agent-${index}`,
      workspaceId: `ws-${index}`,
    }));
    const listActions = vi.fn(async () => [
      { id: "coding", version: 1, enabledByDefault: true, title: "T", description: "D", icon: "I" },
    ]);
    const fake = createFakeClient({
      agents,
      rpc: async (method) => {
        if (method === "settings.prompt-kit.read") {
          return { status: "ready", revision: "r1", values: promptKitSettingsSchema.parse({}) };
        }
        throw new Error(`unexpected rpc ${method}`);
      },
    });
    // Drive the same entry point the plugin uses, with a counting listActions.
    const { registerAgentPills } = await import("../../client/pills/agent-pills.js");
    const cleanup = registerAgentPills(
      fake.client,
      () => async () => {},
      {
        listActions,
        readSettings: async () => ({
          status: "ready",
          values: promptKitSettingsSchema.parse({}),
        }),
      },
    );
    await flush();
    expect(fake.live()).toHaveLength(5);
    expect(listActions).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe("hosts without a Composer DOM", () => {
  it("makes the pill a popover sheet instead of an in-place rewrite", async () => {
    const web = await import("../../client/composer-bridge/web.js");
    const real = web.createWebComposerAdapter;
    const spy = vi.spyOn(web, "createWebComposerAdapter").mockImplementation(() => ({
      ...real(),
      isSupported: () => false,
    }));
    const { fake, cleanup } = await mountWith({}, [agentA]);
    const behavior = button(fake.live()[0]!).behavior as { kind: string; Content?: unknown };
    expect(behavior.kind).toBe("popover");
    // The sheet's header is the plugin name, not the action's title.
    expect(button(fake.live()[0]!).title).toBe("PromptKit");
    expect(typeof behavior.Content).toBe("function");
    expect(fake.rpcCalls.map((call) => call.method)).not.toContain("prompt-kit.rewrite");
    cleanup();
    spy.mockRestore();
  });
});
