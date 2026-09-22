import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { listLanguages } from "../../../shared/language-registry/registry.js";
import { SOURCE_LANGUAGE } from "../../../shared/language-registry/schema.js";
import type { PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";
import { SplitSelect } from "../ui/split-select.js";

export interface EngineSectionProps {
  theme: PluginTheme;
  compact: boolean;
  values: PromptKitSettings;
  disabled: boolean;
  patch(update: SettingsPatch): void;
}

const TRANSPORT_OPTIONS = [
  { label: "Provider CLI", value: "cli" },
  { label: "Direct API", value: "api" },
] as const;

const MODEL_OPTIONS = [
  { label: "Current agent model", value: "current" },
  { label: "Dedicated model", value: "dedicated" },
] as const;

const TRANSPORT_HINT = {
  cli: "The provider's own CLI runs the rewrite headlessly in an empty scratch directory. Needs that CLI on the daemon's PATH.",
  api: "One HTTP request to an endpoint you configure below. Fastest, and works for providers with no CLI. Needs a key.",
} as const;

const MODEL_HINT = {
  current: "The model the Composer shows for the agent whose pill you press. Nothing else to choose.",
  dedicated: "A fixed provider and model, whatever the agent itself runs. Pick them below.",
} as const;

/** The built-in default first, then every loaded language in barrel order. */
const LANGUAGE_OPTIONS = [
  { label: "Same as the prompt", value: SOURCE_LANGUAGE },
  ...listLanguages().map((language) => ({ label: language.label, value: language.id })),
] as const;

/** Transport, the CLI's model source, and output language. Model source exists only for Provider CLI. */
export function EngineSection({ theme, compact, values, disabled, patch }: EngineSectionProps) {
  return (
    <SettingsSection
      title="Rewrite engine"
      info="Transport answers how the model is reached. On Provider CLI, Model source answers which model; on Direct API the model is chosen under API endpoint. Output language answers what language the rewrite is written in."
    >
      <SettingsCard>
        <SplitSelect
          theme={theme}
          compact={compact}
          label="Transport"
          hint={TRANSPORT_HINT[values.transport]}
          value={values.transport}
          options={TRANSPORT_OPTIONS}
          disabled={disabled}
          onValueChange={(transport) => patch({ transport: transport === "api" ? "api" : "cli" })}
        />
        {values.transport === "cli" ? (
          <SplitSelect
            theme={theme}
            compact={compact}
            label="Model source"
            hint={MODEL_HINT[values.modelMode]}
            value={values.modelMode}
            options={MODEL_OPTIONS}
            disabled={disabled}
            onValueChange={(modelMode) =>
              patch({ modelMode: modelMode === "dedicated" ? "dedicated" : "current" })
            }
          />
        ) : null}
        <SplitSelect
          theme={theme}
          compact={compact}
          label="Output language"
          hint={
            values.outputLanguage === SOURCE_LANGUAGE
              ? "The rewrite keeps the language the prompt was written in."
              : "The prose is translated; paths, commands, code and names stay exactly as written."
          }
          error={
            LANGUAGE_OPTIONS.some((option) => option.value === values.outputLanguage)
              ? null
              : `"${values.outputLanguage}" is not a loaded language. See docs/guides/output-languages.md.`
          }
          value={values.outputLanguage}
          options={
            LANGUAGE_OPTIONS.some((option) => option.value === values.outputLanguage)
              ? LANGUAGE_OPTIONS
              : [{ label: `${values.outputLanguage} (missing)`, value: values.outputLanguage }, ...LANGUAGE_OPTIONS]
          }
          disabled={disabled}
          onValueChange={(outputLanguage) => patch({ outputLanguage })}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
