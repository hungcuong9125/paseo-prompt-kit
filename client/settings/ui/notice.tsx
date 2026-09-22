import { useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { RADIUS, SPACE, textStyles, toneColor, type Tone } from "./tokens.js";

export interface NoticeProps {
  theme: PluginTheme;
  tone: Tone;
  title: string;
  /** One or two short lines under the title. */
  lines?: readonly string[];
  /** Controls on the right, or below in a compact layout. */
  trailing?: ReactNode;
  compact?: boolean;
  testID?: string;
}

/** Bordered card with a status dot, title and short lines. */
export function Notice({ theme, tone, title, lines = [], trailing, compact, testID }: NoticeProps) {
  const text = useMemo(() => textStyles(theme), [theme]);
  const color = toneColor(theme, tone);
  const card = useMemo(
    () => ({
      flexDirection: compact ? ("column" as const) : ("row" as const),
      alignItems: compact ? ("stretch" as const) : ("center" as const),
      gap: SPACE.md,
      padding: SPACE.lg,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    }),
    [theme, compact],
  );
  const dot = useMemo(
    () => ({ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginTop: 6 }),
    [color],
  );
  return (
    <View style={card} testID={testID}>
      <View style={{ flexDirection: "row", gap: SPACE.sm, flex: 1, minWidth: 0 }}>
        <View style={dot} />
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <Text style={text.strong} testID={testID ? `${testID}-title` : undefined}>
            {title}
          </Text>
          {lines.map((line) => (
            <Text key={line} style={text.muted}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      {trailing ? (
        <View style={{ flexDirection: "row", gap: SPACE.sm, justifyContent: "flex-end" }}>
          {trailing}
        </View>
      ) : null}
    </View>
  );
}
