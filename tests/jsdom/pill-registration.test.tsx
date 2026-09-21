import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => (await import("./mocks.js")).reactNativeMock);
vi.mock(
  "@getpaseo/plugin/client/ui",
  async () => (await import("./mocks.js")).pluginUiMock,
);

import contribute from "../../client/contribute.js";
import { createFakeClient, unmountComposer, type FakePill } from "./fakes.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const agentA = { id: "agent-a", workspaceId: "ws-1" };
const agentB = { id: "agent-b", workspaceId: "ws-2" };

afterEach(unmountComposer);

function menuItems(pill: FakePill) {
  const behavior = pill.button.behavior as { kind: string; items: { id: string; title: string }[] };
  expect(behavior.kind).toBe("menu");
  return behavior.items;
}

describe("composer pill registration", () => {
  it("registers exactly one pill per live agent with the agent's workspace and id", async () => {
    const fake = createFakeClient({ agents: [agentA, agentB] });
    const cleanup = contribute(fake.client);
    await flush();

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
    const fake = createFakeClient({ agents: [agentA] });
    const cleanup = contribute(fake.client);
    await flush();
    expect(fake.live().map((pill) => pill.agentId)).toEqual(["agent-a"]);

    fake.upsert(agentB);
    expect(fake.live().map((pill) => pill.agentId).sort()).toEqual(["agent-a", "agent-b"]);

    fake.removeAgent("agent-a");
    expect(fake.live().map((pill) => pill.agentId)).toEqual(["agent-b"]);

    fake.upsert({ ...agentB, archivedAt: "2026-09-21T00:00:00.000Z" });
    expect(fake.live()).toHaveLength(0);
    cleanup();
  });

  it("removes every registration on cleanup so a reload never duplicates a pill", async () => {
    const fake = createFakeClient({ agents: [agentA, agentB] });
    const first = contribute(fake.client);
    await flush();
    expect(fake.live()).toHaveLength(2);

    first();
    expect(fake.live()).toHaveLength(0);

    const second = contribute(fake.client);
    await flush();
    expect(fake.live()).toHaveLength(2);
    second();
    expect(fake.live()).toHaveLength(0);
  });

  it("registers the settings screen once", async () => {
    const fake = createFakeClient({ agents: [] });
    const cleanup = contribute(fake.client);
    await flush();
    expect(fake.screens.map((screen) => screen.id)).toEqual(["prompt-kit"]);
    cleanup();
  });
});

describe("pill menu", () => {
  it("offers Improve coding prompt as the only item", async () => {
    const fake = createFakeClient({ agents: [agentA] });
    const cleanup = contribute(fake.client);
    await flush();
    const items = menuItems(fake.live()[0]!);
    expect(items.map((item) => item.title)).toEqual(["Improve coding prompt"]);
    expect(items.map((item) => item.id)).toEqual(["coding"]);
    cleanup();
  });
});
