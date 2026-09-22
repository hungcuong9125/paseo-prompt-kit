import type { PluginTheme } from "@getpaseo/plugin";
import type { TextStyle } from "react-native";

/**
 * The few visual constants PromptKit's own components share with the host.
 *
 * The host does not export its spacing, radius or font-size scale to plugins,
 * only its colors, so the values below mirror `packages/app/src/styles/theme.ts`
 * (spacing 2/3/4 = 8/12/16, radius lg = 8, font sm/base = 12/14). Keeping them
 * in one place means a host change is one edit here, not a hunt through JSX.
 */
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
