import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { listLanguages } from "../../../shared/language-registry/registry.js";
import { SOURCE_LANGUAGE } from "../../../shared/language-registry/schema.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";
import { useI18n } from "../../i18n/core.js";
import { SplitSelect } from "../ui/split-select.js";

export interface EngineSectionProps {
  theme: PluginTheme;
  compact: boolean;
  values: PromptKitSettings;
  disabled: boolean;
  patch(update: SettingsPatch): void;
}

/** Transport, the CLI's model source, and output language. Model source exists only for Provider CLI. */
export function EngineSection({ theme, compact, values, disabled, patch }: EngineSectionProps) {
  const { t } = useI18n();
  // Built at render: the "same as the prompt" label follows the UI language.
  const languageOptions = [
    { label: t("engine.output.sameAsPrompt"), value: SOURCE_LANGUAGE },
    ...listLanguages().map((language) => ({ label: language.label, value: language.id })),
  ];
  const transportOptions = [
    { label: t("engine.transport.cli"), value: "cli" },
    { label: t("engine.transport.api"), value: "api" },
  ] as const;
  const modelOptions = [
    { label: t("engine.model.current"), value: "current" },
    { label: t("engine.model.dedicated"), value: "dedicated" },
  ] as const;
  const transportHints = {
    cli: t("engine.transport.hint.cli"),
    api: t("engine.transport.hint.api"),
  } as const;
  const modelHints = {
    current: t("engine.model.hint.current"),
    dedicated: t("engine.model.hint.dedicated"),
  } as const;

  return (
    <SettingsSection
      title={t("engine.title")}
      info={t("engine.info")}
    >
      <SettingsCard>
        <SplitSelect
          theme={theme}
          compact={compact}
          label={t("engine.transport.label")}
          hint={transportHints[values.transport]}
          value={values.transport}
          options={transportOptions}
          disabled={disabled}
          onValueChange={(transport) => patch({ transport: transport === "api" ? "api" : "cli" })}
        />
        {values.transport === "cli" ? (
          <SplitSelect
            theme={theme}
            compact={compact}
            label={t("engine.model.label")}
            hint={modelHints[values.modelMode]}
            value={values.modelMode}
            options={modelOptions}
            disabled={disabled}
            onValueChange={(modelMode) =>
              patch({ modelMode: modelMode === "dedicated" ? "dedicated" : "current" })
            }
          />
        ) : null}
        <SplitSelect
          theme={theme}
          compact={compact}
          label={t("engine.output.label")}
          hint={
            values.outputLanguage === SOURCE_LANGUAGE
              ? t("engine.output.hint.source")
              : t("engine.output.hint.translated")
          }
          error={
            languageOptions.some((option) => option.value === values.outputLanguage)
              ? null
              : t("engine.output.missing", { id: values.outputLanguage })
          }
          value={values.outputLanguage}
          options={
            languageOptions.some((option) => option.value === values.outputLanguage)
              ? languageOptions
              : [
                  { label: t("engine.output.missingSuffix", { id: values.outputLanguage }), value: values.outputLanguage },
                  ...languageOptions,
                ]
          }
          disabled={disabled}
          onValueChange={(outputLanguage) => patch({ outputLanguage })}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
