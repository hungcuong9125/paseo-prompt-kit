import type { PluginTheme } from "@getpaseo/plugin";
import type { SettingsDraft } from "../draft.js";
import type { Readiness } from "../readiness.js";
import { tNow, useI18n } from "../../i18n/core.js";
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
  if (draft.problem !== null) return tNow("status.cannotSave");
  if (draft.saveError !== null) return tNow("status.saveFailed");
  switch (readiness.kind) {
    case "ready":
      return tNow("status.ready", { path: readiness.path });
    case "blocked":
      return tNow("status.blocked", { path: readiness.path });
    case "checking":
      return tNow("status.checking", { path: readiness.path });
  }
}

function lines(readiness: Readiness, draft: SettingsDraft, actionsChanged: boolean): string[] {
  const out: string[] = [];
  if (draft.problem !== null) out.push(draft.problem);
  else if (draft.saveError !== null) out.push(draft.saveError);
  else if (readiness.kind === "blocked") out.push(readiness.reason);
  else out.push(`${readiness.detail} ${tNow("status.configNote")}`);

  if (draft.dirty) {
    out.push(
      actionsChanged ? tNow("status.unsavedActions") : tNow("status.unsaved"),
    );
  } else if (draft.justSaved) {
    out.push(tNow("common.saved"));
  }
  return out;
}

/** Readiness line plus Save/Discard when dirty. */
export function StatusBar({ theme, readiness, draft, actionsChanged, compact }: StatusBarProps) {
  useI18n();
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
              label={tNow("common.discard")}
              onPress={draft.discard}
              disabled={draft.saving}
              testID="prompt-kit-discard"
            />
            <Button
              theme={theme}
              label={draft.saving ? tNow("common.saving") : tNow("common.save")}
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
