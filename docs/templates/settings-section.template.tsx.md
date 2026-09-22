# Template — `client/settings/sections/<name>-section.tsx`

A section is one group of rows that share a reason to exist. It receives `values` + `patch`
from the draft and keeps no settings state of its own; local state (currently testing, currently
open) is a `useState` inside the section.

```tsx
import { SettingsCard, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";

export interface MySectionProps {
  values: PromptKitSettings;
  disabled: boolean;
  /** Increments when the draft is discarded/saved; SettingsInput keys on it to reread initialValue. */
  epoch?: number;
  patch(update: SettingsPatch): void;
}

/** <One sentence: what this section lets the user decide.> */
export function MySection({ values, disabled, patch }: MySectionProps) {
  return (
    <SettingsSection
      title="My section"
      info="One sentence explaining what this section is for; the host renders it as a tooltip next to the title."
    >
      <SettingsCard>
        <SettingsSwitch
          label="Enable thing"
          hint="State the effect of the current value, don't repeat the label."
          value={values.myFlag}
          disabled={disabled}
          onValueChange={(next) => patch({ myFlag: next })}
        />
        <SettingsSelect
          label="Mode"
          error={values.myMode === null ? "Choose a mode." : null}
          value={values.myMode ?? ""}
          options={[{ label: "Select…", value: "" }, { label: "Fast", value: "fast" }]}
          disabled={disabled}
          onValueChange={(next) => patch({ myMode: next === "" ? null : next })}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
```

Mount it in `settings-screen.tsx` with a display condition, if it needs one:

```tsx
{values.transport === "api" ? <MySection values={values} disabled={disabled} patch={draft.patch} /> : null}
```

Conventions:
- Words go into a row's `hint`/`error` or a section's `info` — no bare `Text` inside a section.
- A read-modify-write patch (a map, an array) uses the functional form:
  `patch((current) => ({ ... }))`.
- A value with bounds ⇒ add a rule to `client/settings/validation.ts`; affects the run path ⇒
  `readiness.ts`.
</content>
