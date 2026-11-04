import { ScrollView } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { PromptKitSettingsScreen } from "../settings/settings-screen.js";

/**
 * What the left-sidebar entry opens. Host screen layouts scroll their own
 * chrome but not arbitrary component bodies, so the screen owns the settings
 * page's scrolling: without it a long settings page cannot move.
 */
export function SidebarSurface(props: PluginScreenProps) {
  return (
    <ScrollView style={{ flex: 1, minHeight: 0, width: "100%" }}>
      <PromptKitSettingsScreen {...props} />
    </ScrollView>
  );
}
