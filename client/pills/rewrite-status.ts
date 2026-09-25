export type RewriteStatus = "idle" | "rewriting" | "rewritten";

/** A null `agentId` is the slash path: it reaches every pill in the workspace. */
export interface RewriteStatusTarget {
  workspaceId: string;
  agentId: string | null;
}

export type RewriteStatusListener = (target: RewriteStatusTarget, status: RewriteStatus) => void;

/** Carries rewrite progress from the runners to the pills that display it. */
export interface RewriteStatusBus {
  publish(target: RewriteStatusTarget, status: RewriteStatus): void;
  subscribe(listener: RewriteStatusListener): () => void;
}

export function createRewriteStatusBus(): RewriteStatusBus {
  const listeners = new Set<RewriteStatusListener>();
  return {
    publish(target, status) {
      for (const listener of listeners) listener(target, status);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function reachesPill(target: RewriteStatusTarget, pill: RewriteStatusTarget): boolean {
  return target.workspaceId === pill.workspaceId && (target.agentId === null || target.agentId === pill.agentId);
}
