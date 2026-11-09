/**
 * The daemon keeps each agent's latest rewrite verdict so the asking client
 * can poll it when the `rewrite` response is lost on the way back (a phone
 * behind a flaky relay). Only the latest verdict per agent is kept — bounded
 * by the live agent count; entries are superseded, never accumulated. The
 * verdict carries the run's `requestId`: a poll names the requestId it is
 * waiting for, so a verdict from a different run (another surface or device
 * rewriting the same agent) reads as "pending" and can never leak.
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

const latest = new Map<string, RewriteVerdict>();

/** Records a finished rewrite as the agent's latest verdict. */
export function recordRewriteVerdict(
  agentId: string,
  requestId: string,
  verdict: { ok: boolean; text: string; code?: RewriteErrorCode },
): void {
  latest.set(agentId, { requestId, ok: verdict.ok, text: verdict.text, ...(verdict.code === undefined ? {} : { code: verdict.code }) });
}

/** The agent's latest verdict when it belongs to `requestId`; "still running" otherwise. */
export function readRewriteVerdict(agentId: string, requestId: string): RewriteVerdict | { pending: true } {
  const verdict = latest.get(agentId);
  if (verdict === undefined || verdict.requestId !== requestId) return { pending: true };
  return verdict;
}

/** Test seam: forgets every verdict. */
export function forgetRewriteVerdicts(): void {
  latest.clear();
}
