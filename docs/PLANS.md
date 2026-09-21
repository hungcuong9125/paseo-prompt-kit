# Execution Plans

An ExecPlan is a concise, checked-in direction document for work that must survive restart or
handoff. It preserves decisions and acceptance; it is not implementation written in prose.

## When Required

Use [FEATURE_INTAKE.md](FEATURE_INTAKE.md). A task or issue is enough for tiny and bounded normal
work.
Create an active ExecPlan for material risk, irreversibility, uncertainty, broad owner/contract
impact, external side effects, or restart/handoff.

## Packet lifecycle

A packet lives in exactly one directory, and the directory is the packet's
lifecycle state. Move the file when the state changes; never leave a closed
packet in `active/`.

| Directory | Meaning |
|---|---|
| [`exec-plans/active/`](exec-plans/active/) | Open work. Someone is or can be dispatched against it right now. |
| [`exec-plans/proposed/`](exec-plans/proposed/) | Drafted but never dispatched, or dispatched and cancelled without action. |
| [`exec-plans/done/`](exec-plans/done/) | Reached a terminal state. Immutable custody; read for evidence, never reused as current direction. |

A packet is **terminal** when one of these is true, and only then:

| Terminal state | Meaning |
|---|---|
| `ACCEPTED` | Work completed and accepted. |
| `EXCLUDED_FROM_CURRENT_V1` | Ruled out of the current contract by an owner decision. |
| `CLOSED — NO_ACTION` | Never dispatched, or cancelled before any work. |
| `SUPERSEDED` | A later packet took over the same gate, and this one will never be worked again. |

`SUPERSEDED` is the one terminal state that does **not** imply the packet's own
verdict was resolved. A packet can be superseded while its own disposition is
still `BLOCKED`. When that happens the banner **must** name where its open
blockers went — the successor packet, a retained UNKNOWN in the project's current-state
record, if one exists, or both. Moving a `BLOCKED` packet to `done/` without that carry-over statement hides open blockers and is a governance defect, not bookkeeping.

Terminal state is a property of the packet, not of the gate.

`active/` is the frontier. If you are looking for what to work on, read that
directory and nothing else.

A packet in `done/` never becomes current again. When work resumes on the same
gate, write a new packet that names the closed one as preserve-not-reuse.

## Required Content

```md
# [Outcome-oriented title]

## Outcome And Constraints
[Observable outcome, governing policy, and excluded scope.]

## Context And Ownership
[Owning area, affected boundaries/contracts, and only the context needed to navigate.]

## Direction And Work Units
[Owner-clean direction, coherent outcome slices, invariants, failure modes, and likely wrong turns.]

## Acceptance And Recovery
[Claims, evidence capable of falsifying them, rollout/rollback, and recovery for risky state.]
```

Add `Progress`, `Decision Log`, or `Discoveries` only when their information must survive the
current session. Empty sections are ceremony.

## Rules

An ExecPlan must:

- be restartable from the plan and working tree without prior chat;
- preserve settled architecture, single-contract hard-cut, reset/rebuild, safety, and data rules;
- divide work by outcomes or owner boundaries rather than files;
- state observable acceptance and claim-shaped evidence;
- define rollout, rollback, and recovery when work is externally stateful or non-idempotent;
- link canonical owner docs instead of restating them.

It must not:

- prescribe exact symbols, pseudocode, private control flow, or a line-by-line edit sequence;
- leave material product, architecture, contract-cutover, or safety decisions to the implementer;
- define completion as internal edits, coverage percentage, report existence, or ceremony;
- become a diary, evidence archive, or review transcript.

When direction changes, update the current direction and acceptance. Git owns ordinary history.
