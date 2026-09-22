import { useMemo } from "react";
import { Pressable, Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { FONT, RADIUS, SPACE } from "./tokens.js";

export interface ButtonProps {
  theme: PluginTheme;
  label: string;
  onPress(): void;
  /** `primary` is the one action the screen wants pressed; `outline` is everything else. */
  variant?: "primary" | "outline";
  disabled?: boolean;
  testID?: string;
}

/**
 * A button that sits outside a `SettingsRow`.
 *
 * The host's `SettingsAction` is a whole row with one outline button on the
 * right, which is right for a row and wrong for a pair of Save/Discard controls
 * in a banner. This mirrors the host button's size and radius so the two read
 * as the same family.
 */
export function Button({ theme, label, onPress, variant = "outline", disabled, testID }: ButtonProps) {
  const primary = variant === "primary";
  const container = useMemo(
    () => ({
      paddingVertical: SPACE.xs + 2,
      paddingHorizontal: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: primary ? theme.colors.accent : theme.colors.border,
      backgroundColor: primary ? theme.colors.accent : "transparent",
      opacity: disabled ? 0.5 : 1,
    }),
    [theme, primary, disabled],
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
