/**
 * The CLI families PromptKit can drive, and the one rule that maps a Paseo
 * provider id onto one of them.
 *
 * Both sides need this file: the server owns how each family is invoked, the
 * settings screen owns showing a user which family a provider will resolve to
 * and letting them override it. Keeping the rule here means the screen can never
 * show a different answer from the one the daemon acts on.
 */
export const CLI_FAMILY_IDS = ["pi", "claude", "codex", "opencode"] as const;

export type CliFamilyId = (typeof CLI_FAMILY_IDS)[number];

export function isCliFamilyId(value: string): value is CliFamilyId {
  return (CLI_FAMILY_IDS as readonly string[]).includes(value);
}

/** Longest id first, so `opencode` is tested before any shorter prefix would match. */
const FAMILY_IDS_BY_LENGTH: readonly CliFamilyId[] = [...CLI_FAMILY_IDS].sort(
  (left, right) => right.length - left.length,
);

/**
 * Resolves a Paseo provider id to the family that runs it, or null.
 *
 * Paseo names a built-in provider after its CLI (`pi`, `codex`) and a custom
 * profile after the role it plays (`pi-peer`, `codex-lead`), so the family is
 * the id itself or its leading or trailing segment. An explicit mapping from
 * settings wins, which is the only way to name a profile whose id does not
 * mention its CLI. Nothing falls back to a default: an unknown provider fails
 * closed.
 */
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
