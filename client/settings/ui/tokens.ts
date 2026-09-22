import type { PluginTheme } from "@getpaseo/plugin";
import type { TextStyle } from "react-native";

/** Spacing/radius/font values mirrored from the host theme (not exported to plugins). */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16 } as const;
export const RADIUS = { md: 6, lg: 8 } as const;
export const FONT = { sm: 12, base: 14 } as const;

export type Tone = "info" | "success" | "warning" | "danger";

export function toneColor(theme: PluginTheme, tone: Tone): string {
  switch (tone) {
    case "success":
      return theme.colors.statusSuccess;
    case "warning":
      return theme.colors.statusWarning;
    case "danger":
      return theme.colors.statusDanger;
    default:
      return theme.colors.accent;
  }
}

export interface TextStyles {
  readonly body: TextStyle;
  readonly strong: TextStyle;
  readonly muted: TextStyle;
  readonly danger: TextStyle;
}

export function textStyles(theme: PluginTheme): TextStyles {
  return {
    body: { color: theme.colors.foreground, fontSize: FONT.base },
    strong: { color: theme.colors.foreground, fontSize: FONT.base, fontWeight: "600" },
    muted: { color: theme.colors.foregroundMuted, fontSize: FONT.sm },
    danger: { color: theme.colors.statusDanger, fontSize: FONT.sm },
  };
}
