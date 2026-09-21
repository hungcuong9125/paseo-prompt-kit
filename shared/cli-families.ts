/**
 * The CLI families PromptKit can drive. The ids live in `shared/` because both
 * sides need them: the server owns how each one is invoked, the settings screen
 * owns letting a user name the family for a provider whose id does not say it.
 */
export const CLI_FAMILY_IDS = ["pi", "claude", "codex", "opencode"] as const;

export type CliFamilyId = (typeof CLI_FAMILY_IDS)[number];

export function isCliFamilyId(value: string): value is CliFamilyId {
  return (CLI_FAMILY_IDS as readonly string[]).includes(value);
}
