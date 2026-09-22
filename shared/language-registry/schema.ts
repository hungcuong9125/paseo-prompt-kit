import { z } from "zod";

/** Output language v1: id, label, and the instruction Core appends to the task. */
export const LANGUAGE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** The built-in choice: keep the language the prompt was written in. */
export const SOURCE_LANGUAGE = "source";

export const MAX_LANGUAGE_INSTRUCTION_CHARS = 2_000;

export const languageSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z
    .string()
    .regex(LANGUAGE_ID_PATTERN)
    .refine((id) => id !== SOURCE_LANGUAGE, `"${SOURCE_LANGUAGE}" is the built-in default`),
  label: z.string().min(1).max(80),
  instruction: z.string().min(1).max(MAX_LANGUAGE_INSTRUCTION_CHARS),
});

export type OutputLanguage = z.output<typeof languageSchema>;
