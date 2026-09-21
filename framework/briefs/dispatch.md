# Dispatch brief

The skeleton for every Peer dispatch. Fill each line; delete a
line only when it truly does not apply. Brief as objective, constraints, and
required evidence — never a pre-solved verdict, never a prescribed
implementation. Attach `review.md` or `design.md` by path when the
disposition calls for it.

```text
Task / AIT id:        <ait issue id | none> — <short title>
AIT db:               <main checkout>/.ait/ait.db  (pass as `ait --db` from a worktree; omit with no issue)
Intent brief:         docs/intents/<id>.md @ <sha>
Acceptance checks:    <the checks from the brief this task must satisfy>
Disposition:          implement | investigate | review | verify | advise | design
Repository / workspace: <root path> · <worktree + branch when isolated>
Outcome:              <observable result, not a solution shape>
Write scope:          <globs the Peer may edit> | NONE
Excluded scope:       <paths and behaviors explicitly out of bounds>
Contract source:      <where the boundary the work touches is defined:
                       brief decision / spec path / existing code path;
                       none → the Peer returns BLOCKED, it does not invent one>
Locked decisions:     <decisions already bound, with DLF ids>
Invariants:           <what must stay true>
Verification target:  <the evidence needed and the scope that can answer it;
                       name the canonical project entry point when known;
                       broaden the check when the change crosses a boundary;
                       UI: an agent-browser snapshot or screenshot at <url>
Gate:                 <NOT YOURS | cite <log> @ tree <hash> | RUN: <command>
                       detached to <log>, report REAL_EXIT> — exactly one seat
                       per batch runs the full gate
Ceremony:             <ait <id> | none — reason> · <worktree | working branch>
Stop condition:       <when the Peer ends the turn instead of continuing>
Route:                <provider/model/thinking; "Human override: ..." if off-table>
Handback contract:    PEER_HAND_BACK as the final message — base/candidate SHA,
                       changed boundary, commands + results, blockers,
                       UNKNOWNs, next action, artifact link, observed-at
```

Signals the Peer may return instead of a candidate: `REOPEN_REQUEST` (name the
failed layer: foundation, dependency, lifecycle, API, ownership,
verification), `DEPENDENCY_REQUEST`, `BLOCKED`. Each carries evidence,
consequence, and the smallest decision needed. A signal is an early final
message: the Peer ends its turn and the Lead re-prompts it. No seat ids travel
in a dispatch.

## Verification strategy

The verification target is a judgment prompt, not a prescribed command list.
Before choosing it, consider what changed, what claim matters, which cheaper
check could distinguish the current hypotheses, and whether the change crosses
an integration boundary. Full verification is usually most useful once the
relevant candidate has converged; the Lead may choose another sequence when
the project's risk or evidence demands it.
