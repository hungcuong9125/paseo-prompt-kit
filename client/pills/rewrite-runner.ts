import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { ComposerAdapter } from "../composer-bridge/adapter.js";
import { providerCatalogRpc, rewriteRpc, type RewriteInput } from "../../shared/rpc.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";
import type { SettingsRead } from "../settings/read-settings.js";
import { validateDedicatedSelection } from "../settings/selection.js";
import type { RewriteStatus } from "./rewrite-status.js";

export interface RewriteRunnerInput {
  adapter: ComposerAdapter;
  rpc: PluginClientContext["rpc"];
  readSettings: () => Promise<SettingsRead>;
  /** Null when the Composer has no agent yet (a new seat's draft). */
  agentId: string | null;
  workspaceId: string;
  /** False once this runner's owner is gone, so a late result is never applied. */
  isActive: () => boolean;
  onStatus: (status: RewriteStatus) => void;
}

export interface RewriteRunner {
  /** Pill path: rewrite the Composer's own text in place. */
  run(actionId: string): Promise<void>;
  /** Slash path: restore `/rewrite <text>` in the emptied Composer, then replace it with the rewrite. */
  runText(actionId: string, text: string): Promise<void>;
  isBusy(): boolean;
}

const SLASH_PREFIX = /^\s*\/rewrite(?:\s+|$)/i;

/** What the host removed from the Composer when it ran the slash command. */
export function slashLine(text: string): string {
  return `/rewrite ${text}`;
}

/** A `/rewrite ` left in front of the prompt is not part of it. */
export function stripSlashPrefix(text: string): string {
  return text.replace(SLASH_PREFIX, "");
}

/** Never sends; writes the Composer only if it still holds what it held before the request. */
export function createRewriteRunner(input: RewriteRunnerInput): RewriteRunner {
  let busy = false;

  async function rewrite(actionId: string, source: string): Promise<string> {
    const settings = await input.readSettings();
    if (settings.status === "invalid") throw new Error(settings.error);
    // API path needs no CLI catalog.
    if (settings.values.transport === "cli" && settings.values.modelMode === "dedicated") {
      const catalog = await input.rpc(providerCatalogRpc, {});
      const selectionError = validateDedicatedSelection(settings.values, catalog.providers);
      if (selectionError !== null) throw new Error(selectionError);
    } else if (settings.values.transport === "api") {
      const selectionError = validateDedicatedSelection(settings.values, []);
      if (selectionError !== null) throw new Error(selectionError);
    }
    if (!input.isActive()) throw new Error("This agent is no longer available.");
    const request: RewriteInput = {
      actionId,
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      originalPrompt: source,
      settings: promptKitSettingsSchema.parse(settings.values),
    };
    const output = await input.rpc(rewriteRpc, request);
    if (output.status === "error") throw new Error(output.error.message);
    if (!input.isActive()) throw new Error("This agent is no longer available; your text was kept.");
    return output.rewrittenPrompt;
  }

  /** Writes `next` only when the Composer still holds `expected`. */
  function apply(expected: string, next: string, changedMessage: string): void {
    if (input.adapter.readText() !== expected) throw new Error(changedMessage);
    if (!input.adapter.replaceText(next)) {
      throw new Error("PromptKit could not find the Composer to update.");
    }
    input.adapter.focus();
  }

  /** Rewrites `prompt` while the Composer shows `shown`; reports progress through `onStatus`. */
  async function rewriteInPlace(actionId: string, prompt: string, shown: string): Promise<void> {
    const endEffect = input.adapter.beginRewriteEffect();
    input.onStatus("rewriting");
    let status: RewriteStatus = "idle";
    try {
      const rewritten = await rewrite(actionId, prompt);
      apply(shown, rewritten, "The prompt changed while PromptKit was rewriting; your text was kept.");
      status = "rewritten";
    } finally {
      endEffect();
      input.onStatus(status);
    }
  }

  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    if (busy) throw new Error("PromptKit is already rewriting this prompt.");
    busy = true;
    try {
      return await work();
    } finally {
      busy = false;
    }
  }

  return {
    run: (actionId) =>
      guarded(async () => {
        const source = input.adapter.readText();
        if (source === null) throw new Error(input.adapter.describeFailure());
        const prompt = stripSlashPrefix(source);
        if (prompt.trim() === "") throw new Error("Write a prompt first.");
        await rewriteInPlace(actionId, prompt, source);
      }),
    runText: (actionId, text) =>
      guarded(async () => {
        if (text.trim() === "") throw new Error("Write a prompt after /rewrite.");
        const current = input.adapter.readText();
        if (current === null) throw new Error(input.adapter.describeFailure());
        // Host emptied the Composer: restore the full line so nothing jumps, dim it, then replace.
        const restored = slashLine(text);
        if (current === "" && !input.adapter.replaceText(restored)) {
          throw new Error("PromptKit could not find the Composer to update.");
        }
        await rewriteInPlace(actionId, text, restored);
      }),
    isBusy: () => busy,
  };
}
