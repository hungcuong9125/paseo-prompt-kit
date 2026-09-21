import type { RewriteError } from "../shared/rpc.js";
import { pluginLog } from "./log.js";
import type { PaseoAgentHandle, PaseoApi } from "./paseo-types.js";

export interface GenerateRewriteInput {
  workspaceId: string;
  provider: string;
  thinkingOptionId: string | null;
  systemPrompt: string;
  taskPrompt: string;
  timeoutMs: number;
}

export type GenerateRewriteResult =
  | { ok: true; text: string }
  | { ok: false; error: RewriteError };

export interface GenerateRewriteDependencies {
  /** Test seam: observes the temporary agent id and the archive attempt. */
  onTempAgent?: (agentId: string) => void;
}

/**
 * Runs one rewrite in a temporary agent inside the caller's workspace.
 *
 * The agent is archived in `finally`, not through `autoArchive`: auto-archive is
 * driven by terminal turn events, and the pinned client exposes no observable
 * archive state to prove cleanup on a failed or timed-out turn.
 */
export async function generateRewrite(
  paseo: PaseoApi,
  input: GenerateRewriteInput,
  dependencies: GenerateRewriteDependencies = {},
): Promise<GenerateRewriteResult> {
  const workspace = paseo.workspaces.ref(input.workspaceId);
  let tempAgent: PaseoAgentHandle | null = null;

  try {
    tempAgent = await workspace.agents.create({
      config: {
        provider: input.provider,
        thinkingOptionId: input.thinkingOptionId ?? undefined,
        systemPrompt: input.systemPrompt,
      },
      title: "PromptKit rewrite",
      prompt: input.taskPrompt,
      labels: { "prompt-kit": "rewrite" },
    });
    dependencies.onTempAgent?.(tempAgent.id);
    pluginLog.info({ agentId: tempAgent.id, provider: input.provider }, "temporary agent created");

    const result = await tempAgent.waitForFinish(input.timeoutMs);
    if (result.status === "timeout") {
      return { ok: false, error: { code: "timeout", message: "The rewrite timed out." } };
    }
    if (result.status !== "idle") {
      return {
        ok: false,
        error: {
          code: "generation_failed",
          message: result.error ?? `The rewrite agent ended with status: ${result.status}`,
        },
      };
    }
    const text = result.lastMessage?.trim() ?? "";
    // Emptiness and shape are the validator's contract; the generator returns raw text.
    return { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "generation_failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    if (tempAgent) {
      try {
        await tempAgent.archive();
      } catch (error) {
        pluginLog.error(
          { agentId: tempAgent.id, error: error instanceof Error ? error.message : String(error) },
          "temporary agent archive failed",
        );
      }
    }
  }
}
