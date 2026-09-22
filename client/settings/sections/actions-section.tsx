import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { ActionSummary } from "../../../shared/rpc.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import { enabledActions } from "../../actions/enabled.js";
import type { SettingsPatch } from "../draft.js";

export interface ActionsSectionProps {
  /** Null while the registry has not answered yet. */
  actions: readonly ActionSummary[] | null;
  error: string | null;
  values: PromptKitSettings;
  disabled: boolean;
  patch(update: SettingsPatch): void;
  reload(): void;
}

/** Per-action enable switches. */
export function ActionsSection({ actions, error, values, disabled, patch, reload }: ActionsSectionProps) {
  return (
    <SettingsSection
      title="Actions"
      info="Each action is a pack bundled with the plugin. One enabled action makes the pill a direct button; two or more make it a menu; none hides the pill."
    >
      <SettingsCard>
        {error !== null ? (
          <SettingsAction
            label="Could not load actions"
            error={error}
            actionLabel="Retry"
            disabled={disabled}
            onPress={reload}
          />
        ) : actions === null ? (
          <SettingsRow label="Loading actions…" />
        ) : actions.length === 0 ? (
          <SettingsRow
            label="No action pack is loaded"
            hint="Add one under shared/packs/ and list it in shared/packs/index.ts. See docs/EXTENDING.md."
          />
        ) : (
          actions.map((action) => (
            <SettingsSwitch
              key={action.id}
              label={action.title}
              hint={action.description}
              value={enabledActions([action], values).length === 1}
              disabled={disabled}
              onValueChange={(next) =>
                patch((current) => ({
                  actionEnabled: { ...current.actionEnabled, [action.id]: next },
                }))
              }
            />
          ))
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
