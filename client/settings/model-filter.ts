export interface ModelOption {
  readonly label: string;
  readonly value: string;
}

/** Lists at or below this length get no filter row. */
export const MODEL_FILTER_THRESHOLD = 8;

/**
 * Pure: options whose name or id contains the query, case-insensitive. The option equal to
 * `keep` (the current selection) stays, so the host dropdown still shows it.
 */
export function filterModels(
  options: readonly ModelOption[],
  query: string,
  keep: string | null = null,
): readonly ModelOption[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return options;
  return options.filter(
    (option) =>
      option.value === keep ||
      option.label.toLowerCase().includes(needle) ||
      option.value.toLowerCase().includes(needle),
  );
}

/** Hint for the filter row: how many of the models the dropdown now lists. */
export function describeFilter(total: number, shown: number, query: string): string {
  return query.trim() === ""
    ? `Type part of a name or id to shorten the Model list below (${total} models).`
    : `${shown} of ${total} models match.`;
}
