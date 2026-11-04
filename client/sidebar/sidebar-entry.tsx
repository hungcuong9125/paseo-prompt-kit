import { SidebarRow } from "@getpaseo/plugin/client/ui";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { PLUGIN_ICON } from "../icon.js";
import type { SettingsRead } from "../settings/read-settings.js";
import { onSettingsSaved } from "../settings/settings-saved.js";
import { SCREEN_ID } from "./screen-ids.js";
import { SidebarSurface } from "./sidebar-surface.js";

export interface SidebarEntryDependencies {
  readSettings: () => Promise<SettingsRead>;
}

const ENTRY_ID = "prompt-kit";

export interface SidebarEntryDependenciesFull extends SidebarEntryDependencies {}

/**
 * The left-sidebar entry: opens PromptKit's settings screen from the host's
 * sidebar. The switch lives in Settings → Interface, so the item follows the
 * saved document the same way the Composer pills do: read once at startup,
 * re-read on every save, and fail closed on an unreadable document — an entry
 * the user never chose must not appear.
 *
 * The screen registers once for the plugin's lifetime and never toggles: the
 * switch may be turned off while the screen is open on display, and screens
 * are independent of sidebar items, so the open page keeps working. Only the
 * sidebar item comes and goes; the screen itself is unreachable without it.
 *
 * Hosts (and test fakes) without a screen registry skip the screen and item
 * entirely: there the entry simply cannot exist.
 */
export function registerSidebarEntry(
  client: PluginClientContext,
  dependencies: SidebarEntryDependencies,
): () => void {
  const hasScreens = typeof client.addScreen === "function" && typeof client.addSidebarHeaderItem === "function";
  const removeScreen = hasScreens
    ? client.addScreen({ id: SCREEN_ID, title: "PromptKit", Component: SidebarSurface })
    : () => undefined;
  let removeItem: (() => void) | null = null;
  let cancelled = false;
  let syncing = 0;

  async function sync(generation: number): Promise<void> {
    const read = await dependencies.readSettings();
    // Cleanup ran while the read was in flight: drop the answer.
    if (cancelled || generation !== syncing) return;
    const wanted = hasScreens && read.status === "ready" && read.values.sidebarEntry === true;
    if (wanted && removeItem === null) {
      removeItem = client.addSidebarHeaderItem({
        id: ENTRY_ID,
        title: "PromptKit",
        Component: SidebarRowForSettings,
      });
    }
    if (!wanted && removeItem !== null) {
      removeItem();
      removeItem = null;
    }
  }

  function resync(): void {
    syncing += 1;
    void sync(syncing).catch(() => {
      // A failed read must not leave an entry the user's document refuses.
      removeItem?.();
      removeItem = null;
    });
  }

  resync();
  const unsubscribe = onSettingsSaved(() => resync());

  return () => {
    cancelled = true;
    unsubscribe();
    removeItem?.();
    removeScreen();
  };
}

/** The sidebar row: opens the PromptKit settings screen. */
function SidebarRowForSettings({ openScreen }: { openScreen(params: { screenId: string }): void }) {
  return <SidebarRow icon={PLUGIN_ICON} onPress={() => openScreen({ screenId: SCREEN_ID })} />;
}
