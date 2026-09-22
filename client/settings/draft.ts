import { useCallback, useMemo, useState } from "react";
import type { SettingsState } from "@getpaseo/plugin/client";
import type { promptKitSettings, PromptKitSettings } from "../../shared/settings.js";
import { findSaveProblem } from "./validation.js";

type ReadySettings = Extract<SettingsState<typeof promptKitSettings.schema>, { status: "ready" }>;

export type SettingsPatch =
  | Partial<PromptKitSettings>
  | ((current: PromptKitSettings) => Partial<PromptKitSettings>);

export interface SettingsDraft {
  /** What the screen shows: the draft when one exists, else the host document. */
  readonly values: PromptKitSettings;
  readonly dirty: boolean;
  readonly saving: boolean;
  /** The host's last save failure, cleared by the next edit or save. */
  readonly saveError: string | null;
  /** Why the draft cannot be saved as it stands; null when Save is allowed. */
  readonly problem: string | null;
  /** True right after a successful save, until the next edit. */
  readonly justSaved: boolean;
  /** Bumps on discard/save; uncontrolled inputs key on it. */
  readonly epoch: number;
  patch(update: SettingsPatch): void;
  discard(): void;
  save(): Promise<void>;
}

/** Draft over the host document; functional patches; revision pinned at first edit. */
export function useSettingsDraft(settings: ReadySettings): SettingsDraft {
  const [draft, setDraft] = useState<{ values: PromptKitSettings; revision: string } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [epoch, setEpoch] = useState(0);

  const values = draft?.values ?? settings.values;
  const revision = draft?.revision ?? settings.revision;
  const problem = useMemo(() => findSaveProblem(values), [values]);

  const patch = useCallback(
    (update: SettingsPatch) => {
      setJustSaved(false);
      setDraft((previous) => {
        const base = previous ?? { values: settings.values, revision: settings.revision };
        const changes = typeof update === "function" ? update(base.values) : update;
        return { ...base, values: { ...base.values, ...changes } };
      });
    },
    [settings.values, settings.revision],
  );

  const discard = useCallback(() => {
    setDraft(null);
    setJustSaved(false);
    setEpoch((current) => current + 1);
  }, []);

  const save = useCallback(async () => {
    if (draft === null || problem !== null) return;
    const ok = await settings.save(draft.values, revision);
    if (ok) {
      setDraft(null);
      setJustSaved(true);
      setEpoch((current) => current + 1);
    }
  }, [draft, problem, revision, settings]);

  return {
    values,
    dirty: draft !== null,
    saving: settings.saving,
    saveError: settings.saveError,
    problem,
    justSaved,
    epoch,
    patch,
    discard,
    save,
  };
}
