import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsAction, SettingsInput } from "@getpaseo/plugin/client/ui";

export type KeyStatus = { status: "ok"; stored: boolean } | { status: "error"; message: string };
export type KeyWriteResult = { status: "ok" } | { status: "error"; message: string };

export interface StoredKeyRowsProps {
  /** What the value is, e.g. "API key" or "Account ID"; names the rows. */
  subject: string;
  /** The secrets.json entry name. */
  name: string;
  secretsDir: string | null;
  disabled: boolean;
  status(input: { secretsDir: string | null; name: string }): Promise<KeyStatus>;
  write(input: { secretsDir: string | null; name: string; value: string | null }): Promise<KeyWriteResult>;
}

type Stored = { kind: "unknown" } | { kind: "known"; stored: boolean } | { kind: "error"; message: string };

/** Write-only entry of one secrets.json key: the value is sent once and never shown again. */
export function StoredKeyRows({ subject, name, secretsDir, disabled, status, write }: StoredKeyRowsProps) {
  const [stored, setStored] = useState<Stored>({ kind: "unknown" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const value = useRef("");
  const trimmedName = name.trim();

  const refresh = useCallback(async () => {
    if (trimmedName === "") return setStored({ kind: "unknown" });
    try {
      const result = await status({ secretsDir, name: trimmedName });
      setStored(result.status === "ok" ? { kind: "known", stored: result.stored } : { kind: "error", message: result.message });
    } catch (error) {
      setStored({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [secretsDir, status, trimmedName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (next: string | null) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await write({ secretsDir, name: trimmedName, value: next });
      if (result.status === "error") return setMessage(result.message);
      value.current = "";
      setTyped(false);
      setInputKey((key) => key + 1);
      setMessage(next === null ? `Removed ${trimmedName} from secrets.json.` : `Saved ${trimmedName} to secrets.json.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const state =
    stored.kind === "known"
      ? stored.stored
        ? `secrets.json holds a value for ${trimmedName}.`
        : `secrets.json has no value for ${trimmedName} yet.`
      : stored.kind === "error"
        ? stored.message
        : "";
  const canWrite = !disabled && !busy && trimmedName !== "";

  return (
    <>
      <SettingsInput
        key={`${subject}-${inputKey}`}
        label={subject}
        hint={`Convenience only: the value travels once from this screen to the daemon and is written to secrets.json. Prefer an environment variable or editing secrets.json on the daemon's machine. ${state}`.trim()}
        error={message !== null && !message.startsWith("Saved") && !message.startsWith("Removed") ? message : null}
        initialValue=""
        placeholder={`Paste the ${subject.toLowerCase()}, then press Save`}
        secureTextEntry={subject === "API key"}
        disabled={!canWrite}
        onChangeText={(text) => {
          value.current = text;
          setTyped(text.trim() !== "");
        }}
      />
      <SettingsAction
        label={`Store ${subject}`}
        hint={message !== null && (message.startsWith("Saved") || message.startsWith("Removed")) ? message : "Write-only: the value is never shown or read back."}
        actionLabel={busy ? "Saving…" : "Save"}
        disabled={!canWrite || !typed}
        onPress={() => void run(value.current)}
      />
      {stored.kind === "known" && stored.stored ? (
        <SettingsAction
          label={`Remove stored ${subject}`}
          hint={`Deletes ${trimmedName} from secrets.json. Other entries are kept.`}
          actionLabel="Remove"
          disabled={!canWrite}
          onPress={() => void run(null)}
        />
      ) : null}
    </>
  );
}
