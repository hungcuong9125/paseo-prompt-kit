import { SettingsCard, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import type { PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";

export interface EngineSectionProps {
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

/** The hint under each control says what the chosen value means, not what the control is. */
const TRANSPORT_HINT = {
  cli: "The provider's own CLI runs the rewrite headlessly in an empty scratch directory. Needs that CLI on the daemon's PATH.",
  api: "One HTTP request to an endpoint you configure below. Fastest, and works for providers with no CLI. Needs a key.",
} as const;

const MODEL_HINT = {
  current: "The model the Composer shows for the agent whose pill you press. Nothing else to choose.",
  dedicated: "A fixed provider and model, whatever the agent itself runs. Pick them below.",
} as const;

/**
 * The two independent choices that decide which rewrite path runs: how the
 * model is reached, and which model it is. Every other section is a
 * consequence of these two values and appears only when they need it.
 */
export function EngineSection({ values, disabled, patch }: EngineSectionProps) {
  return (
    <SettingsSection
      title="Rewrite engine"
      info="Transport answers how the model is reached; Model source answers which model. The sections below change with these two choices."
    >
      <SettingsCard>
        <SettingsSelect
          label="Transport"
          hint={TRANSPORT_HINT[values.transport]}
          value={values.transport}
          options={TRANSPORT_OPTIONS}
          disabled={disabled}
          onValueChange={(transport) => patch({ transport: transport === "api" ? "api" : "cli" })}
        />
        <SettingsSelect
          label="Model source"
          hint={MODEL_HINT[values.modelMode]}
          value={values.modelMode}
          options={MODEL_OPTIONS}
          disabled={disabled}
          onValueChange={(modelMode) =>
            patch({ modelMode: modelMode === "dedicated" ? "dedicated" : "current" })
          }
        />
      </SettingsCard>
    </SettingsSection>
  );
}
