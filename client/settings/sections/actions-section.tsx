import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { ActionSummary, ActionsListOutput } from "../../../shared/rpc.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import { MAX_ENABLED_ACTIONS, enabledActions } from "../../actions/enabled.js";
import type { SettingsPatch } from "../draft.js";

export interface ActionsSectionProps {
  /** Null while the registry has not answered yet. */
  actions: readonly ActionSummary[] | null;
  /** Packs the registry refused, e.g. a custom action reusing a bundled id. */
  rejected: ActionsListOutput["rejected"];
  error: string | null;
  values: PromptKitSettings;
  disabled: boolean;
  patch(update: SettingsPatch): void;
  reload(): void;
}

function hintFor(action: ActionSummary): string {
  return action.custom ? `Custom · ${action.description}` : action.description;
}

/** Per-action enable switches, at most `MAX_ENABLED_ACTIONS` on; a lone action has no switch. */
export function ActionsSection({ actions, rejected, error, values, disabled, patch, reload }: ActionsSectionProps) {
  const enabledCount = actions === null ? 0 : enabledActions(actions, values).length;
  return (
    <SettingsSection
      title="Actions"
      info={`One enabled action makes the pill rewrite at once; two or more make it a menu to choose from. Up to ${MAX_ENABLED_ACTIONS} can be on. Add your own under Custom actions.`}
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
            hint="Add one under Custom actions below."
          />
        ) : actions.length === 1 && enabledCount === 1 ? (
          <SettingsRow label={actions[0]!.title} hint={`Always on · ${hintFor(actions[0]!)}`} />
        ) : (
          actions.map((action) => {
            const on = enabledActions([action], values).length === 1;
            const full = !on && enabledCount >= MAX_ENABLED_ACTIONS;
            return (
              <SettingsSwitch
                key={action.id}
                label={action.title}
                hint={full ? `${MAX_ENABLED_ACTIONS} actions are on; turn one off first.` : hintFor(action)}
                value={on}
                disabled={disabled || full}
                onValueChange={(next) =>
                  patch((current) => ({
                    actionEnabled: { ...current.actionEnabled, [action.id]: next },
                  }))
                }
              />
            );
          })
        )}
        {rejected.map((entry) => (
          <SettingsRow key={`rejected-${entry.source}-${entry.reason}`} label={`Not loaded: ${entry.source}`} error={entry.reason} />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}
