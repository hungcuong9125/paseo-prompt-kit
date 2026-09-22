import type { ActionDefinition } from "./schema.js";

/**
 * The injection boundary belongs to Core, not to a pack. A pack supplies
 * instruction text only; Core owns the delimiters around it and escapes any
 * content that imitates them.
 *
 * The wrapper is plain text, not a security boundary; escaping the delimiters
 * keeps prompt content that imitates the wrapper from closing it early and
 * reaching the model as top-level instruction text.
 */
export function escapeWrapperDelimiters(text: string): string {
  return text.replace(/<(\/?)(user_prompt|task)\b/gi, "&lt;$1$2");
}

/** Builds `<task>` (+ optional output-language line) and the escaped `<user_prompt>`. */
export function buildTaskPrompt(
  definition: ActionDefinition,
  originalPrompt: string,
  languageInstruction: string | null = null,
): string {
  const language = languageInstruction === null ? "" : `\n\nOutput language: ${languageInstruction}`;
  return `<task>
${definition.taskInstruction}${language}
</task>

<user_prompt>
${escapeWrapperDelimiters(originalPrompt)}
</user_prompt>`;
}
