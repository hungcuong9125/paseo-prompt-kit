import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { ActionSummary, ActionsListOutput } from "../../../shared/rpc.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import { MAX_ENABLED_ACTIONS, enabledActions } from "../../actions/enabled.js";
import type { SettingsPatch } from "../draft.js";
import { useI18n } from "../../i18n/core.js";

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

/** Per-action enable switches, at most `MAX_ENABLED_ACTIONS` on; a lone action has no switch. */
export function ActionsSection({ actions, rejected, error, values, disabled, patch, reload }: ActionsSectionProps) {
  const { t } = useI18n();
  const enabledCount = actions === null ? 0 : enabledActions(actions, values).length;
  const hintFor = (action: ActionSummary): string =>
    action.custom ? t("actions.customHint", { description: action.description }) : action.description;
  return (
    <SettingsSection
      title={t("actions.title")}
      info={t("actions.info", { max: MAX_ENABLED_ACTIONS })}
    >
      <SettingsCard>
        {error !== null ? (
          <SettingsAction
            label={t("actions.loadFailed")}
            error={error}
            actionLabel={t("common.retry")}
            disabled={disabled}
            onPress={reload}
          />
        ) : actions === null ? (
          <SettingsRow label={t("actions.loading")} />
        ) : actions.length === 0 ? (
          <SettingsRow label={t("actions.none")} hint={t("actions.none.hint")} />
        ) : actions.length === 1 && enabledCount === 1 ? (
          <SettingsRow label={actions[0]!.title} hint={t("actions.alwaysOn", { hint: hintFor(actions[0]!) })} />
        ) : (
          actions.map((action) => {
            const on = enabledActions([action], values).length === 1;
            const full = !on && enabledCount >= MAX_ENABLED_ACTIONS;
            return (
              <SettingsSwitch
                key={action.id}
                label={action.title}
                hint={full ? t("actions.full", { max: MAX_ENABLED_ACTIONS }) : hintFor(action)}
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
          <SettingsRow key={`rejected-${entry.source}-${entry.reason}`} label={t("actions.notLoaded", { source: entry.source })} error={entry.reason} />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}
