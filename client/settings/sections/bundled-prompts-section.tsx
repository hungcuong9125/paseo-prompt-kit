import { useState } from "react";
import { Text, View } from "react-native";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsAction } from "@getpaseo/plugin/client/ui";
import type { PluginTheme } from "@getpaseo/plugin";
import type { ActionSummary } from "../../../shared/rpc.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import { REWRITE_CONTRACT } from "../../../shared/action-registry/rewrite-contract.js";
import type { SettingsPatch } from "../draft.js";
import { Button } from "../ui/button.js";
import { useI18n } from "../../i18n/core.js";

/** Edits bundled instructions inside the Settings transaction without changing action identity. */
export function BundledPromptsSection({ actions, values, patch, disabled, theme }: {
  actions: readonly ActionSummary[] | null;
  values: PromptKitSettings;
  patch(update: SettingsPatch): void;
  disabled: boolean;
  theme: PluginTheme;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const selected = actions?.find((action) => action.id === editing && !action.custom);
  const instructions = selected ? values.actionOverrides[selected.id] ?? { system: selected.system, task: selected.task } : null;
  const change = (field: "system" | "task", text: string) => {
    if (!selected || !instructions) return;
    patch((current) => ({ actionOverrides: {
      ...current.actionOverrides,
      [selected.id]: { ...(current.actionOverrides[selected.id] ?? instructions), [field]: text },
    } }));
  };
  const reset = () => {
    if (!selected) return;
    patch((current) => {
      const { [selected.id]: _removed, ...actionOverrides } = current.actionOverrides;
      return { actionOverrides };
    });
    setConfirmReset(false);
    setEditing(null);
  };
  const style = { padding: 12, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.foreground, backgroundColor: theme.colors.surface1, minHeight: 100, textAlignVertical: "top" as const };
  return <>
      {actions?.filter((action) => !action.custom).map((action) => <SettingsAction key={action.id} label={action.title}
        hint={values.actionOverrides[action.id] ? t("bundled.modified") : t("bundled.default")}
        actionLabel={t("bundled.edit")} disabled={disabled} onPress={() => { setEditing(action.id); setConfirmReset(false); }} />)}
    {selected && instructions ? <View style={{ gap: 12, marginTop: 12 }}>
      <Text style={{ color: theme.colors.foreground }}>{t("bundled.rewriteTitle")}</Text>
      <TextInput multiline value={instructions.system} onChangeText={(text) => change("system", text)} editable={!disabled} style={{ ...style, minHeight: 280 }} testID="prompt-kit-default-system" />
      <Text style={{ color: theme.colors.foreground }}>{t("bundled.taskTitle")}</Text>
      <TextInput multiline value={instructions.task} onChangeText={(text) => change("task", text)} editable={!disabled} style={style} testID="prompt-kit-default-task" />
      <Text style={{ color: theme.colors.foregroundMuted }}>{t("bundled.note")}</Text>
      <Text selectable style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{REWRITE_CONTRACT}</Text>
      {values.actionOverrides[selected.id] ? <Button theme={theme} label={confirmReset ? t("bundled.confirmReset") : t("bundled.reset")} disabled={disabled}
        onPress={() => confirmReset ? reset() : setConfirmReset(true)} testID="prompt-kit-default-reset" /> : null}
      <Button theme={theme} label={t("bundled.closeEditor")} onPress={() => { setEditing(null); setConfirmReset(false); }} />
    </View> : null}
  </>;
}
