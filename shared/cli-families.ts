/** CLI families and the provider-id → family rule, shared by server and settings UI. */
export const CLI_FAMILY_IDS = ["pi", "claude", "codex", "opencode"] as const;

export type CliFamilyId = (typeof CLI_FAMILY_IDS)[number];

export function isCliFamilyId(value: string): value is CliFamilyId {
  return (CLI_FAMILY_IDS as readonly string[]).includes(value);
}

/** Longest id first, so `opencode` is tested before any shorter prefix would match. */
const FAMILY_IDS_BY_LENGTH: readonly CliFamilyId[] = [...CLI_FAMILY_IDS].sort(
  (left, right) => right.length - left.length,
);

/** Explicit map wins; else the id itself or its leading/trailing segment; else null. */
export function resolveCliFamilyId(
  providerId: string,
  providerMap: Readonly<Record<string, string>> = {},
): CliFamilyId | null {
  const mapped = providerMap[providerId];
  if (mapped !== undefined) return isCliFamilyId(mapped) ? mapped : null;
  for (const family of FAMILY_IDS_BY_LENGTH) {
    if (providerId === family) return family;
    if (providerId.startsWith(`${family}-`) || providerId.endsWith(`-${family}`)) {
      return family;
    }
  }
  return null;
}
