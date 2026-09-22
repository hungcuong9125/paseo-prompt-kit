import { SettingsCard, SettingsRow, SettingsSelect } from "@getpaseo/plugin/client/ui";
import type { ProviderCatalogOutput } from "../../../shared/rpc.js";

type Providers = ProviderCatalogOutput["providers"];

export interface ProviderMapCardProps {
  title: string;
  hint: string;
  /** Null until the catalog has been read. */
  providers: Providers | null;
  /** The current map, provider id → target value. */
  map: Readonly<Record<string, string>>;
  /** What a provider can be mapped to. Empty disables adding. */
  targets: readonly { label: string; value: string }[];
  /** Shown when `targets` is empty, in place of the Add row. */
  emptyTargetsLabel: string;
  /** Row-level error for one mapping, or null. */
  errorFor?(providerId: string, target: string): string | null;
  disabled: boolean;
  onSet(providerId: string, target: string): void;
  onRemove(providerId: string): void;
}

const NONE = "";
const REMOVE = "__remove__";

/**
 * A per-provider map shown as its entries, not as the whole catalog.
 *
 * A Paseo host can carry dozens of provider profiles, and listing every one
 * with "Not mapped" turned a rarely used override into a screen-long table.
 * Only mapped providers get a row; the last row adds one. An unmapped
 * provider costs nothing to look at.
 */
export function ProviderMapCard({
  title,
  hint,
  providers,
  map,
  targets,
  emptyTargetsLabel,
  errorFor,
  disabled,
  onSet,
  onRemove,
}: ProviderMapCardProps) {
  const labelOf = (id: string) => providers?.find((entry) => entry.provider === id)?.label ?? id;
  const mapped = Object.entries(map);
  const unmapped = (providers ?? []).filter((entry) => !(entry.provider in map));
  const firstTarget = targets[0]?.value;

  return (
    <SettingsCard>
      <SettingsRow label={title} hint={hint} />
      {mapped.map(([providerId, target]) => (
        <SettingsSelect
          key={providerId}
          label={labelOf(providerId)}
          hint={providerId}
          error={errorFor?.(providerId, target) ?? null}
          value={target}
          options={[
            // A saved target that is no longer offered stays visible so the row
            // shows what the document holds instead of silently picking another.
            ...(targets.some((option) => option.value === target)
              ? []
              : [{ label: `${target} (missing)`, value: target }]),
            ...targets,
            { label: "Remove mapping", value: REMOVE },
          ]}
          disabled={disabled}
          onValueChange={(next) => (next === REMOVE ? onRemove(providerId) : onSet(providerId, next))}
        />
      ))}
      {providers === null ? (
        <SettingsRow label="Loading providers…" />
      ) : firstTarget === undefined ? (
        <SettingsRow label={emptyTargetsLabel} />
      ) : unmapped.length === 0 ? (
        <SettingsRow label="Every provider is mapped." />
      ) : (
        <SettingsSelect
          label={mapped.length === 0 ? "No provider is mapped" : "Add another provider"}
          hint="Pick a provider; its row appears above with the first target, which you can then change."
          value={NONE}
          options={[
            { label: "Add mapping…", value: NONE },
            ...unmapped.map((entry) => ({ label: `${entry.label} · ${entry.provider}`, value: entry.provider })),
          ]}
          disabled={disabled}
          onValueChange={(providerId) => {
            if (providerId !== NONE) onSet(providerId, firstTarget);
          }}
        />
      )}
    </SettingsCard>
  );
}
