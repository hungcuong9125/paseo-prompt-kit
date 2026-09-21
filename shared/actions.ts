import { codingActionStrategy } from "./prompts/coding.js";

/** Adding an action means adding an id here, a strategy, and a registry entry. */
export const promptActionIds = ["coding"] as const;

export type PromptActionId = (typeof promptActionIds)[number];

export interface PromptActionTaskInput {
  originalPrompt: string;
}

/**
 * A strategy owns the wording for one action. The rewrite pipeline reads only
 * this interface, so a new action never touches the pipeline.
 */
export interface PromptActionStrategy {
  systemPrompt(): string;
  taskPrompt(input: PromptActionTaskInput): string;
}

export interface PromptAction {
  id: PromptActionId;
  title: string;
  description: string;
  icon: string;
  enabledByDefault: boolean;
  version: number;
  contextPolicy: "prompt-only";
  outputPolicy: "replace-composer";
  strategy: PromptActionStrategy;
}

const registry: { readonly [Id in PromptActionId]: PromptAction & { id: Id } } = {
  coding: {
    id: "coding",
    title: "Improve coding prompt",
    description: "Rewrite the current request for a coding agent.",
    icon: "Code2",
    enabledByDefault: true,
    version: 1,
    contextPolicy: "prompt-only",
    outputPolicy: "replace-composer",
    strategy: codingActionStrategy,
  },
};

export const promptActions: readonly PromptAction[] = promptActionIds.map((id) => registry[id]);

export function listPromptActions(): readonly PromptAction[] {
  return promptActions.filter((action) => action.enabledByDefault);
}

export function findPromptAction(id: PromptActionId): PromptAction {
  const action = registry[id];
  if (!action) throw new Error(`Unknown prompt action: ${id}`);
  return action;
}
