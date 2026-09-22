import type { PluginTheme } from "@getpaseo/plugin";
import type { SettingsDraft } from "../draft.js";
import type { Readiness } from "../readiness.js";
import { Button } from "./button.js";
import { Notice } from "./notice.js";
import type { Tone } from "./tokens.js";

export interface StatusBarProps {
  theme: PluginTheme;
  readiness: Readiness;
  draft: SettingsDraft;
  /** True when the draft changed an action toggle, which the pill only sees on reload. */
  actionsChanged: boolean;
  compact: boolean;
}

function tone(readiness: Readiness, draft: SettingsDraft): Tone {
  if (draft.saveError !== null || draft.problem !== null) return "danger";
  if (readiness.kind === "blocked") return "warning";
  if (readiness.kind === "checking") return "info";
  return "success";
}

function title(readiness: Readiness, draft: SettingsDraft): string {
  if (draft.problem !== null) return "Cannot save yet";
  if (draft.saveError !== null) return "Save failed";
  switch (readiness.kind) {
    case "ready":
      return `Ready · ${readiness.path}`;
    case "blocked":
      return `Not ready · ${readiness.path}`;
    case "checking":
      return `Checking · ${readiness.path}`;
  }
}

function lines(readiness: Readiness, draft: SettingsDraft, actionsChanged: boolean): string[] {
  const out: string[] = [];
  if (draft.problem !== null) out.push(draft.problem);
  else if (draft.saveError !== null) out.push(draft.saveError);
  else if (readiness.kind === "blocked") out.push(readiness.reason);
  else out.push(readiness.detail);

  if (draft.dirty) {
    out.push(
      actionsChanged
        ? "Unsaved changes. Action changes reach the Composer pill when the agent re-opens or the plugin reloads."
        : "Unsaved changes.",
    );
  } else if (draft.justSaved) {
    out.push("Saved.");
  }
  return out;
}

/**
 * The screen's single status area: whether a rewrite would run, over which
 * path, and the Save/Discard pair when there is something to save. One place,
 * at the top, so the user never scrolls to find out why the pill did nothing.
 */
export function StatusBar({ theme, readiness, draft, actionsChanged, compact }: StatusBarProps) {
  return (
    <Notice
      theme={theme}
      tone={tone(readiness, draft)}
      title={title(readiness, draft)}
      lines={lines(readiness, draft, actionsChanged)}
      compact={compact}
      testID="prompt-kit-status"
      trailing={
        draft.dirty ? (
          <>
            <Button
              theme={theme}
              label="Discard"
              onPress={draft.discard}
              disabled={draft.saving}
              testID="prompt-kit-discard"
            />
            <Button
              theme={theme}
              label={draft.saving ? "Saving…" : "Save"}
              variant="primary"
              onPress={() => void draft.save()}
              disabled={draft.saving || draft.problem !== null}
              testID="prompt-kit-save"
            />
          </>
        ) : undefined
      }
    />
  );
}
