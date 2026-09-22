import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsSelect, type SettingsSelectProps } from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { FONT, SPACE } from "./tokens.js";

export interface SplitSelectProps<Value extends string> extends SettingsSelectProps<Value> {
  theme: PluginTheme;
  /** Narrow layouts keep the host's plain hint. */
  compact: boolean;
}

/** Share of the text column the hint may fill, so it stops short of the dropdown. */
const HINT_MAX_WIDTH = "85%";

/** Host select row whose hint wraps before the dropdown; the host renders a non-string hint as given. */
export function SplitSelect<Value extends string>({ theme, compact, hint, ...select }: SplitSelectProps<Value>) {
  if (compact || !hint) return <SettingsSelect hint={hint} {...select} />;
  const node = (
    <Text
      style={{ color: theme.colors.foregroundMuted, fontSize: FONT.sm, marginTop: SPACE.xs, maxWidth: HINT_MAX_WIDTH }}
    >
      {hint}
    </Text>
  );
  return <SettingsSelect hint={node as unknown as string} {...select} />;
}
