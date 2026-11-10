/**
 * The daemon keeps recent rewrite verdicts so the asking client can poll them
 * when the `rewrite` response is lost on the way back (a phone behind a flaky
 * relay). Verdicts are keyed by the run's `requestId` and kept per agent with
 * a small per-agent retention (the last KEEP_PER_AGENT runs) — a verdict from
 * another run of the same agent can never answer a different run's poll, and
 * a concurrent run finishing in between cannot evict an unread verdict.
 *
 * Retention is in-memory only: bounded by KEEP_PER_AGENT × live agents,
 * superseded entries age out of the per-agent window, and entries are never
 * accumulated across client reloads.
 */
import type { RewriteErrorCode } from "../shared/rpc.js";

export interface RewriteVerdict {
  requestId: string;
  ok: boolean;
  /** The rewritten prompt on success; the error message on failure. */
  text: string;
  /** Structured error code, so the client can localize poll-delivered failures. */
  code?: RewriteErrorCode;
}

const KEEP_PER_AGENT = 3;

const byAgent = new Map<string, Map<string, RewriteVerdict>>();

/** Records a finished rewrite as the run's verdict, keeping the agent's last KEEP_PER_AGENT runs. */
export function recordRewriteVerdict(
  agentId: string,
  requestId: string,
  verdict: { ok: boolean; text: string; code?: RewriteErrorCode },
): void {
  let runs = byAgent.get(agentId);
  if (runs === undefined) {
    runs = new Map<string, RewriteVerdict>();
    byAgent.set(agentId, runs);
  }
  runs.set(requestId, { requestId, ok: verdict.ok, text: verdict.text, ...(verdict.code === undefined ? {} : { code: verdict.code }) });
  while (runs.size > KEEP_PER_AGENT) {
    const oldest = runs.keys().next().value;
    if (oldest === undefined) break;
    runs.delete(oldest);
  }
}

/** The verdict for exactly this run, or "still running" when it has none (yet). */
export function readRewriteVerdict(agentId: string, requestId: string): RewriteVerdict | { pending: true } {
  const runs = byAgent.get(agentId);
  const verdict = runs?.get(requestId);
  if (verdict === undefined) return { pending: true };
  return verdict;
}

/** Test seam: forgets every verdict. */
export function forgetRewriteVerdicts(): void {
  byAgent.clear();
}
