import type { PluginClientContext } from "@getpaseo/plugin/client";
import { PLUGIN_ICON } from "../icon.js";
import type { SettingsRead } from "../settings/read-settings.js";
import { onSettingsSaved } from "../settings/settings-saved.js";
import { SidebarSurface } from "./sidebar-surface.js";

export interface SidebarEntryDependencies {
  readSettings: () => Promise<SettingsRead>;
}

const ENTRY_ID = "prompt-kit";
const SURFACE_ID = "prompt-kit-settings";

/**
 * The left-sidebar entry: opens PromptKit's settings screen from the host's
 * sidebar. The switch lives in Settings → Interface, so the item follows the
 * saved document the same way the Composer pills do: read once at startup,
 * re-read on every save, and fail closed on an unreadable document — an entry
 * the user never chose must not appear.
 *
 * The surface registers once for the plugin's lifetime and never toggles: the
 * switch may be turned off while the view is open on screen, and unregistering
 * an open surface tears the view down under the reader. Only the sidebar item
 * comes and goes; the surface itself is unreachable without its item.
 */
export function registerSidebarEntry(
  client: PluginClientContext,
  dependencies: SidebarEntryDependencies,
): () => void {
  // Some hosts (and every test fake that predates surfaces) have no surface
  // registry; there the entry simply cannot exist, and only a real desktop
  // client registers the view.
  const removeSurface =
    typeof client.addSurface === "function" ? client.addSurface(SURFACE_ID, SidebarSurface) : null;
  let removeItem: (() => void) | null = null;
  let cancelled = false;
  let syncing = 0;

  async function sync(generation: number): Promise<void> {
    const read = await dependencies.readSettings();
    // Cleanup ran while the read was in flight: drop the answer.
    if (cancelled || generation !== syncing) return;
    const wanted = read.status === "ready" && read.values.sidebarEntry === true;
    if (wanted && removeItem === null) {
      removeItem = client.addSidebarItem({ id: ENTRY_ID, title: "PromptKit", icon: PLUGIN_ICON, surface: SURFACE_ID });
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
    removeSurface?.();
  };
}
