import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { promptKitSettingsSchema } from "../../shared/settings.js";
import { announceSettingsSaved } from "../../client/settings/settings-saved.js";
import type { SettingsRead } from "../../client/settings/read-settings.js";
import { registerSidebarEntry } from "../../client/sidebar/sidebar-entry.js";

// The unit project has no react-native shims; the registration wiring is
// asserted against these stand-ins, not the real components. vi.mock is hoisted.
vi.mock("../../client/settings/settings-screen.js", () => ({
  PromptKitSettingsScreen: () => null,
}));
vi.mock("../../client/sidebar/sidebar-surface.js", () => ({
  SidebarSurface: () => null,
}));
import { SidebarSurface } from "../../client/sidebar/sidebar-surface.js";

function fakeClient() {
  const dropScreen = vi.fn();
  const dropItem = vi.fn();
  const addScreen = vi.fn(() => dropScreen);
  const addSidebarHeaderItem = vi.fn(() => dropItem);
  return {
    client: { addScreen, addSidebarHeaderItem } as unknown as PluginClientContext,
    addScreen,
    addSidebarHeaderItem,
    dropScreen,
    dropItem,
  };
}

function readSettings(values: Record<string, unknown> | null): () => Promise<SettingsRead> {
  return async () => {
    if (values === null) return { status: "invalid", error: "PromptKit settings are invalid." };
    // The real reader parses the whole document; parse() restores every default.
    return { status: "ready", values: promptKitSettingsSchema.parse({ sidebarEntry: false, ...values }) };
  };
}

/** Drains the microtasks one registration sync spans (read + continue). */
async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("sidebar entry", () => {
  it("registers the screen once at startup and the item when the saved switch is on", async () => {
    const { addScreen, addSidebarHeaderItem } = fakeClient();
    const remove = registerSidebarEntry(
      { addScreen, addSidebarHeaderItem } as unknown as PluginClientContext,
      { readSettings: readSettings({ sidebarEntry: true }) },
    );
    await flush();
    expect(addScreen).toHaveBeenCalledTimes(1);
    expect(addScreen).toHaveBeenCalledWith({ id: "prompt-kit-settings", title: "PromptKit", Component: SidebarSurface });
    expect(addSidebarHeaderItem).toHaveBeenCalledTimes(1);
    expect(addSidebarHeaderItem).toHaveBeenCalledWith({
      id: "prompt-kit",
      title: "PromptKit",
      Component: expect.any(Function),
    });
    remove();
  });

  it("keeps the screen resident and toggles only the item when the switch is off or the settings are unreadable", async () => {
    for (const read of [readSettings({}), readSettings(null)]) {
      const { addScreen, addSidebarHeaderItem, dropScreen, dropItem } = fakeClient();
      const remove = registerSidebarEntry(
        { addScreen, addSidebarHeaderItem } as unknown as PluginClientContext,
        { readSettings: read },
      );
      await flush();
      // The screen stays resident (it may be open on display); only the item
      // may come and go, and with the switch off it never registers.
      expect(addScreen).toHaveBeenCalledTimes(1);
      expect(dropScreen).not.toHaveBeenCalled();
      expect(addSidebarHeaderItem).not.toHaveBeenCalled();
      remove();
    }
  });

  it("follows a save: on adds the item, off removes it, and the screen is never touched", async () => {
    const { addScreen, addSidebarHeaderItem, dropScreen, dropItem } = fakeClient();
    let values: Record<string, unknown> = {};
    const remove = registerSidebarEntry(
      { addScreen, addSidebarHeaderItem } as unknown as PluginClientContext,
      { readSettings: () => readSettings(values)() },
    );
    await flush();
    expect(addSidebarHeaderItem).not.toHaveBeenCalled();

    values = { sidebarEntry: true };
    announceSettingsSaved();
    await flush();
    expect(addScreen).toHaveBeenCalledTimes(1);
    expect(addSidebarHeaderItem).toHaveBeenCalledTimes(1);

    values = {};
    announceSettingsSaved();
    await flush();
    expect(addScreen).toHaveBeenCalledTimes(1);
    expect(addSidebarHeaderItem).toHaveBeenCalledTimes(1);
    expect(dropScreen).not.toHaveBeenCalled();
    expect(dropItem).toHaveBeenCalledTimes(1);
    remove();
  });

  it("drops both registrations on cleanup and ignores a save that arrives after it", async () => {
    const { addScreen, addSidebarHeaderItem, dropScreen, dropItem } = fakeClient();
    const remove = registerSidebarEntry(
      { addScreen, addSidebarHeaderItem } as unknown as PluginClientContext,
      { readSettings: readSettings({ sidebarEntry: true }) },
    );
    await flush();
    expect(addSidebarHeaderItem).toHaveBeenCalledTimes(1);
    remove();
    expect(dropScreen).toHaveBeenCalledTimes(1);
    expect(dropItem).toHaveBeenCalledTimes(1);

    announceSettingsSaved();
    await flush();
    expect(addScreen).toHaveBeenCalledTimes(1);
    expect(addSidebarHeaderItem).toHaveBeenCalledTimes(1);
    expect(dropItem).toHaveBeenCalledTimes(1);
  });
});
