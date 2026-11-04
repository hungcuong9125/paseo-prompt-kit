import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { promptKitSettingsSchema } from "../../shared/settings.js";
import { PLUGIN_ICON } from "../../client/icon.js";
import { announceSettingsSaved } from "../../client/settings/settings-saved.js";
import type { SettingsRead } from "../../client/settings/read-settings.js";
import { registerSidebarEntry } from "../../client/sidebar/sidebar-entry.js";

// The unit project has no react-native shims; the surface wiring is asserted
// against these stand-ins, not the real components. vi.mock is hoisted.
vi.mock("../../client/settings/settings-screen.js", () => ({
  PromptKitSettingsScreen: () => null,
}));
vi.mock("../../client/sidebar/sidebar-surface.js", () => ({
  SidebarSurface: () => null,
}));
import { SidebarSurface } from "../../client/sidebar/sidebar-surface.js";

function fakeClient() {
  const dropSurface = vi.fn();
  const dropItem = vi.fn();
  const addSurface = vi.fn(() => dropSurface);
  const addSidebarItem = vi.fn(() => dropItem);
  return { client: { addSurface, addSidebarItem } as unknown as PluginClientContext, addSurface, addSidebarItem, dropSurface, dropItem };
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
  it("registers the surface once and the sidebar item when the saved switch is on", async () => {
    const { client, addSurface, addSidebarItem } = fakeClient();
    const remove = registerSidebarEntry(client, { readSettings: readSettings({ sidebarEntry: true }) });
    await flush();
    expect(addSurface).toHaveBeenCalledTimes(1);
    expect(addSurface).toHaveBeenCalledWith("prompt-kit-settings", SidebarSurface);
    expect(addSidebarItem).toHaveBeenCalledWith({ id: "prompt-kit", title: "PromptKit", icon: PLUGIN_ICON, surface: "prompt-kit-settings" });
    remove();
  });

  it("toggles only the item when the switch is off or the settings are unreadable", async () => {
    for (const read of [readSettings({}), readSettings(null)]) {
      const { client, addSurface, addSidebarItem, dropSurface } = fakeClient();
      const remove = registerSidebarEntry(client, { readSettings: read });
      await flush();
      // The surface stays resident: the host tears down an on-screen
      // registration, so only the sidebar item may come and go.
      expect(addSurface).toHaveBeenCalledTimes(1);
      expect(dropSurface).not.toHaveBeenCalled();
      expect(addSidebarItem).not.toHaveBeenCalled();
      remove();
    }
  });

  it("follows a save: on adds the entry, off removes it without touching the surface", async () => {
    const { client, addSurface, addSidebarItem, dropSurface, dropItem } = fakeClient();
    let values: Record<string, unknown> = {};
    const remove = registerSidebarEntry(client, {
      readSettings: () => readSettings(values)(),
    });
    await flush();
    expect(addSurface).toHaveBeenCalledTimes(1);
    expect(addSidebarItem).not.toHaveBeenCalled();

    values = { sidebarEntry: true };
    announceSettingsSaved();
    await flush();
    expect(addSurface).toHaveBeenCalledTimes(1);
    expect(addSidebarItem).toHaveBeenCalledTimes(1);

    values = {};
    announceSettingsSaved();
    await flush();
    expect(addSurface).toHaveBeenCalledTimes(1);
    expect(addSidebarItem).toHaveBeenCalledTimes(1);
    expect(dropSurface).not.toHaveBeenCalled();
    expect(dropItem).toHaveBeenCalledTimes(1);
    remove();
  });

  it("drops the entry on cleanup and ignores a save that arrives after it", async () => {
    const { client, addSurface, addSidebarItem, dropSurface, dropItem } = fakeClient();
    const remove = registerSidebarEntry(client, { readSettings: readSettings({ sidebarEntry: true }) });
    await flush();
    expect(addSidebarItem).toHaveBeenCalledTimes(1);
    remove();
    expect(dropSurface).toHaveBeenCalledTimes(1);
    expect(dropItem).toHaveBeenCalledTimes(1);

    announceSettingsSaved();
    await flush();
    expect(addSurface).toHaveBeenCalledTimes(1);
    expect(addSidebarItem).toHaveBeenCalledTimes(1);
    expect(dropItem).toHaveBeenCalledTimes(1);
  });
});
