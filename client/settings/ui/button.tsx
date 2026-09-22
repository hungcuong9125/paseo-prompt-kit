import { useMemo } from "react";
import { Pressable, Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { FONT, RADIUS, SPACE } from "./tokens.js";

export interface ButtonProps {
  theme: PluginTheme;
  label: string;
  onPress(): void;
  /** `primary` is the one action the screen wants pressed; `ghost` has no chrome. */
  variant?: "primary" | "outline" | "ghost";
  /** Stretch to share the row equally with siblings. */
  fill?: boolean;
  disabled?: boolean;
  testID?: string;
}

/** Button for use outside a SettingsRow; mirrors the host button's size and radius. */
export function Button({ theme, label, onPress, variant = "outline", fill, disabled, testID }: ButtonProps) {
  const primary = variant === "primary";
  const ghost = variant === "ghost";
  const container = useMemo(
    () => ({
      paddingVertical: SPACE.xs + 2,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: ghost ? 0 : 1,
      borderColor: primary ? theme.colors.accent : theme.colors.border,
      backgroundColor: primary ? theme.colors.accent : "transparent",
      opacity: disabled ? 0.5 : 1,
      alignItems: "center" as const,
      ...(fill ? { flex: 1 } : {}),
    }),
    [theme, primary, ghost, fill, disabled],
  );
  const text = useMemo(
    () => ({
      color: primary ? theme.colors.accentForeground : theme.colors.foreground,
      fontSize: FONT.base,
      fontWeight: "500" as const,
    }),
    [theme, primary],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={container}
      testID={testID}
    >
      <Text style={text}>{label}</Text>
    </Pressable>
  );
}
