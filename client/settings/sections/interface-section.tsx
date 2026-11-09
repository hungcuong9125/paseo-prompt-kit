import { SettingsCard, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useI18n, UI_LANGUAGES } from "../../i18n/core.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";

export interface InterfaceSectionProps {
  values: PromptKitSettings;
  disabled: boolean;
  patch(update: SettingsPatch): void;
  /** True where rewrites run through the popover sheet (no Composer DOM) — the
   *  only surface the keep-original switch affects. */
  mobileSheet?: boolean;
}

/** The host-surface switch and the UI language. The switch applies on Save; the language preview applies at once. */
export function InterfaceSection({ values, disabled, patch, mobileSheet = false }: InterfaceSectionProps) {
  const { t, language } = useI18n();
  const options = UI_LANGUAGES.map((entry) => ({
    value: entry.value,
    // Each option is written in its own language, the standard for language pickers.
    label: entry.value === "auto" ? `${t("language.auto")} (${entry.labelNative})` : entry.labelNative,
  }));
  return (
    <SettingsSection title={t("interface.title")}>
      <SettingsCard>
        <SettingsSelect
          label={t("interface.language.label")}
          hint={t("interface.language.hint")}
          value={values.uiLanguage}
          options={options}
          disabled={disabled}
          onValueChange={(next) => {
            const value = UI_LANGUAGES.find((entry) => entry.value === next)?.value;
            if (value !== undefined) patch({ uiLanguage: value });
          }}
        />
        <SettingsSwitch
          label={t("interface.sidebar.label")}
          hint={t("interface.sidebar.hint")}
          value={values.sidebarEntry}
          disabled={disabled}
          onValueChange={(next) => patch({ sidebarEntry: next })}
        />
        {mobileSheet ? (
          <SettingsSwitch
            label={t("interface.composerOriginal.label")}
            hint={t("interface.composerOriginal.hint")}
            value={values.composerIncludeOriginal}
            disabled={disabled}
            onValueChange={(next) => patch({ composerIncludeOriginal: next })}
          />
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}
