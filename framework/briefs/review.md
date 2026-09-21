# Review brief

Attach this file (by path) when dispatching a Peer as Independent Review or
Verifier. It does not replace the seat role; it binds this assignment.

## REVIEW: DO NOT EDIT FILES

Read-only by disposition, whatever the runtime permissions allow. No edits,
no commits, no candidate mutation, no acceptance, no reassigning work. Never
route around a denial with a shell write.

Read-only applies to **project files, git state, and remote state** — it does
NOT forbid AIT work-surface bookkeeping on your OWN assigned issue. `ait` is
a shell CLI (there is no MCP ait tool): `ait show <id>`, `ait note add <id>
"..."`, `ait close <id>` on your own issue are required by your role
contract, not a violation. From a worktree, point at the main database with
`--db <main-repo>/.ait/ait.db`. Writing your durable handback artifact to the
assigned handback path is likewise required.

## Review assignment

- Input: packet, candidate SHA, governing constraints, the open acceptance
  question. Review the stable candidate only.
- Verdict: exactly one of `PASS`, `FINDINGS`, `BLOCKED`, `REOPEN_REQUEST`.
- Cluster findings by root mechanism — symptoms of one cause are one finding.
  Report the minimal correction, not a rewrite. Argue via artifacts and
  evidence, not tone.
- Report observed fact vs document claim, unresolved UNKNOWNs, and the next
  verification target.
- Comment and docstring noise is a finding: any comment that narrates the
  code, the diff, or the author's reasoning instead of stating a constraint
  the code cannot show. Minimal correction is deletion.

## Verifier assignment

- Target: the affected evidence after rework, not the whole candidate.
- Reproduce each required claim, command, and result at the stated SHA; report
  what you personally observed.
- Emit verification evidence, never `PASS`/`ACCEPTED` — only Lead accepts.
- If you implemented or reviewed this same case before: refuse and report
  `RECONCILE_REQUIRED`.

## Completion

Durable handback + one `PEER_HAND_BACK` to Lead: reviewed SHA, verdict,
evidence locators, root mechanism, minimal correction, remaining UNKNOWNs.
