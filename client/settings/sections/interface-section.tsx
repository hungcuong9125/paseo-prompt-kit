import { SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";

export interface InterfaceSectionProps {
  values: PromptKitSettings;
  disabled: boolean;
  patch(update: SettingsPatch): void;
}

/** The host-surface switch: the left-sidebar entry. Applies on Save. */
export function InterfaceSection({ values, disabled, patch }: InterfaceSectionProps) {
  return (
    <SettingsSection title="Interface">
      <SettingsCard>
        <SettingsSwitch
          label="Show in the left sidebar"
          hint="Adds a PromptKit entry to the host's left sidebar; it opens this settings screen. The entry appears and disappears when you Save — an open settings page keeps working either way."
          value={values.sidebarEntry}
          disabled={disabled}
          onValueChange={(next) => patch({ sidebarEntry: next })}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
