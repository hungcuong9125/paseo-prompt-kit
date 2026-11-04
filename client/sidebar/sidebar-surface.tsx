import { ScrollView } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { PromptKitSettingsScreen } from "../settings/settings-screen.js";

/**
 * What the left-sidebar entry opens. A sidebar panel gives the component no
 * scroll container of its own (the settings area wraps the screen itself), so
 * the surface owns the scrolling: without it a long settings page cannot move.
 */
export function SidebarSurface(props: PluginSurfaceProps) {
  return (
    <ScrollView style={{ flex: 1, minHeight: 0, width: "100%" }}>
      <PromptKitSettingsScreen {...props} />
    </ScrollView>
  );
}
