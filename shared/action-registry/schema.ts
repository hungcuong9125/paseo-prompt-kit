import { z } from "zod";

/**
 * Action Pack schema v1. A pack is pure data: no code, no imports, no paths.
 *
 * `system` and `task` are instruction text inline in the JSON, never file paths.
 * The host bundles the pack into the server bundle at build time (esbuild has no
 * `.md` loader and the daemon is never given the plugin directory), so there is
 * no runtime filesystem to read a separate file from.
 */
export const ACTION_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Mirrors the `originalPrompt` ceiling in the rewrite RPC. */
export const MAX_INSTRUCTION_CHARS = 50_000;

export const actionPackSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().regex(ACTION_ID_PATTERN),
  version: z.number().int().positive(),
  /** Out-of-box state. A user toggle overrides it; Core never reorders packs. */
  enabledByDefault: z.boolean(),
  title: z.string().min(1),
  description: z.string().min(1),
  /** Host icon name. Not checked against a host list: a wrong name renders empty. */
  icon: z.string().min(1),
  context: z.strictObject({ mode: z.literal("prompt-only") }),
  output: z.strictObject({ mode: z.literal("replace-composer") }),
  system: z.string().min(1).max(MAX_INSTRUCTION_CHARS),
  task: z.string().min(1).max(MAX_INSTRUCTION_CHARS),
});

export type ActionPack = z.output<typeof actionPackSchema>;

/**
 * A pack as the rest of the plugin sees it. The wrapper (`<task>`,
 * `<user_prompt>` and delimiter escaping) belongs to Core, so a definition
 * carries instruction text only.
 */
export interface ActionDefinition {
  readonly id: string;
  readonly version: number;
  readonly enabledByDefault: boolean;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly contextMode: "prompt-only";
  readonly outputMode: "replace-composer";
  readonly systemPrompt: string;
  readonly taskInstruction: string;
}

export function toActionDefinition(pack: ActionPack): ActionDefinition {
  return {
    id: pack.id,
    version: pack.version,
    enabledByDefault: pack.enabledByDefault,
    title: pack.title,
    description: pack.description,
    icon: pack.icon,
    contextMode: pack.context.mode,
    outputMode: pack.output.mode,
    systemPrompt: pack.system,
    taskInstruction: pack.task,
  };
}
