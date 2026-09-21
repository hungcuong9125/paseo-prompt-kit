# Packet Template

One packet per dispatched gate/task. Fill the task card fully; use the other
sections as the work reaches them. Keep prose out — evidence and identifiers.

## Task card

```yaml
task:            # short id/name — matches the ait issue
outcome:         # observable result, not a solution shape
owner:           # PASEO_AGENT_ID + ait issue id (one writable owner)
depends_on: []   # ait blocker ids / locked decisions
change_boundary: # writable paths; everything else is out of scope
invariants: []   # what must stay true (retry, totals, contracts…)
acceptance: []   # observed behavior + tests/proof required
reopen_when: []  # premises that invalidate this task if false
```

## Route

- Requested provider/model/thinking → effective:
- Attached brief/skills (paths):

## Handback (Implement)

- Base SHA / candidate SHA:
- Changed boundary:
- Commands + results:
- Blockers / UNKNOWNs:
- Next action:

## Review

- Reviewed SHA:
- Verdict: `PASS | FINDINGS | BLOCKED | REOPEN_REQUEST`
- Findings (clustered by root mechanism) + minimal correction:

## Verification

- Verified SHA / prior participation `NONE`:
- Reproduced commands + observed results:

## Lead decision

- Decision: `ACCEPTED | REOPENED | ESCALATED | BLOCKED`
- Final acceptance commit SHA:
- Decision-log ID / MEMORY updated:
