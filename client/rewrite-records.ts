/**
 * The last rewrite pair per agent, kept client-side so the original prompt
 * survives a rewrite on every platform. The Composer always carries what gets
 * sent (the rewritten text, or the user's own edit); the original lives only
 * here and is surfaced for review through the sheet (mobile) and the pill menu
 * (desktop). One entry per agent, replaced by the next rewrite — never
 * accumulated, cleared on client reload (no host persistence).
 */
export interface LastRewrite {
  /** What was delivered into the Composer / sent by default. */
  rewritten: string;
  /** The text the rewrite started from. */
  original: string;
}

const lastRewrites = new Map<string, LastRewrite>();

/** Records the result of a finished rewrite, replacing any previous pair. */
export function recordLastRewrite(agentId: string, pair: LastRewrite): void {
  lastRewrites.set(agentId, { rewritten: pair.rewritten, original: pair.original });
}

/** The agent's last rewrite pair, or undefined before the first rewrite of this session. */
export function readLastRewrite(agentId: string): LastRewrite | undefined {
  return lastRewrites.get(agentId);
}

/** Test seam: forgets every recorded pair. */
export function forgetLastRewrites(): void {
  lastRewrites.clear();
}
