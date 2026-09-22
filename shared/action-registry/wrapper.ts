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

/**
 * Assembles the task. `languageInstruction` is the output-language sentence
 * from the language registry, or null to keep the prompt's own language; it is
 * placed inside `<task>` so it is instruction text, never part of the untrusted
 * `<user_prompt>` block.
 */
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
