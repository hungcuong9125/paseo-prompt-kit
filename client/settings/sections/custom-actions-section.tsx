import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsAction, SettingsCard, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import type { ActionSummary } from "../../../shared/rpc.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import { ACTION_SAMPLES } from "../action-samples.js";
import { formatPack, freeActionId, parseCustomAction, removeCustomAction, storeCustomAction } from "../custom-actions.js";
import type { SettingsPatch } from "../draft.js";
import { Button } from "../ui/button.js";
import { RADIUS, SPACE, textStyles } from "../ui/tokens.js";

export interface CustomActionsSectionProps {
  theme: PluginTheme;
  /** Null while the registry has not answered yet. */
  actions: readonly ActionSummary[] | null;
  values: PromptKitSettings;
  disabled: boolean;
  patch(update: SettingsPatch): void;
}

type Editing = { id: string | null; text: string; error: string | null };

const COPY_PREFIX = "copy:";

/** Custom actions as JSON: pick a sample or an existing action, edit, Apply. Save stores them. */
export function CustomActionsSection({ theme, actions, values, disabled, patch }: CustomActionsSectionProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const text = useMemo(() => textStyles(theme), [theme]);
  const busy = disabled || actions === null;

  const takenIds = (except: string | null): Set<string> =>
    new Set((actions ?? []).map((action) => action.id).filter((id) => id !== except));

  const startFrom = (choice: string) => {
    const copy = choice.startsWith(COPY_PREFIX)
      ? values.customActions.find((pack) => pack.id === choice.slice(COPY_PREFIX.length))
      : undefined;
    const base = copy ?? ACTION_SAMPLES.find((sample) => sample.key === choice)?.pack;
    if (base === undefined) return;
    const pack = { ...base, id: freeActionId(base.id, takenIds(null)) };
    setEditing({ id: null, text: formatPack(pack), error: null });
  };

  const apply = () => {
    if (editing === null || actions === null) return;
    const parsed = parseCustomAction(editing.text, takenIds(editing.id));
    if (!parsed.ok) {
      setEditing({ ...editing, error: parsed.error });
      return;
    }
    const replacingId = editing.id;
    patch((current) => storeCustomAction(current, actions, parsed.pack, replacingId));
    setEditing(null);
  };

  const remove = () => {
    if (editing?.id == null) return;
    const id = editing.id;
    patch((current) => removeCustomAction(current, id));
    setEditing(null);
  };

  const startOptions = [
    ...ACTION_SAMPLES.map((sample) => ({ label: sample.label, value: sample.key })),
    ...values.customActions.map((pack) => ({ label: `Copy of ${pack.title}`, value: `${COPY_PREFIX}${pack.id}` })),
  ];

  const box = {
    minHeight: 280,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: editing?.error ? theme.colors.statusDanger : theme.colors.border,
    backgroundColor: theme.colors.surface1,
    color: theme.colors.foreground,
    fontFamily: "monospace",
    fontSize: 12,
    textAlignVertical: "top" as const,
  };

  return (
    <SettingsSection
      title="Custom actions"
      info="Your own actions, written as action-pack JSON. Start from a sample, change the id, title and instructions, then Apply and Save. They run through the same rewrite as the bundled actions."
    >
      <SettingsCard>
        {values.customActions.map((pack) => (
          <SettingsAction
            key={pack.id}
            label={pack.title}
            hint={`${pack.id} · ${pack.description}`}
            actionLabel="Edit"
            disabled={busy || editing !== null}
            onPress={() => setEditing({ id: pack.id, text: formatPack(pack), error: null })}
          />
        ))}
        {editing === null ? (
          <SettingsAction
            label="Add action"
            hint="Opens a sample to edit."
            actionLabel="Add"
            disabled={busy}
            onPress={() => startFrom(ACTION_SAMPLES[0]!.key)}
            testID="prompt-kit-custom-add"
          />
        ) : editing.id === null ? (
          <SettingsSelect
            label="Start from"
            hint="Replaces the JSON below."
            value=""
            options={[{ label: "Choose a sample…", value: "" }, ...startOptions]}
            onValueChange={(choice) => {
              if (choice !== "") startFrom(choice);
            }}
            disabled={busy}
          />
        ) : null}
      </SettingsCard>

      {editing !== null ? (
        <View style={{ gap: SPACE.md, marginTop: SPACE.md }}>
          <TextInput
            multiline
            value={editing.text}
            onChangeText={(next) => setEditing({ ...editing, text: next, error: null })}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            editable={!busy}
            style={box}
            testID="prompt-kit-custom-json"
          />
          {editing.error !== null ? (
            <Text style={text.danger} testID="prompt-kit-custom-error">
              {editing.error}
            </Text>
          ) : (
            <Text style={text.muted}>
              Apply checks the JSON and adds it to the unsaved changes; Save stores it.
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: SPACE.md }}>
            {editing.id !== null ? (
              <Button theme={theme} label="Delete" onPress={remove} disabled={busy} testID="prompt-kit-custom-delete" />
            ) : null}
            <View style={{ flex: 1 }} />
            <Button theme={theme} label="Cancel" onPress={() => setEditing(null)} testID="prompt-kit-custom-cancel" />
            <Button
              theme={theme}
              label="Apply"
              variant="primary"
              onPress={apply}
              disabled={busy}
              testID="prompt-kit-custom-apply"
            />
          </View>
        </View>
      ) : null}
    </SettingsSection>
  );
}
