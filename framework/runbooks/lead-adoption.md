# Lead — Existing Project Adoption Runbook

Use this runbook only when a Lead takes over a project that already contains
work, history, owners, or uncertain delivery claims. It supplements the Lead
seat role; it does not replace it.

## Required reading

Read the repository `README.md`, `AGENTS.md`, `framework/protocol.md`, and
project-root `WORKSPACE_PROTOCOL.md`. Then read:

- `framework/README.md`;
- `framework/provider-routing.md`;
- the installed `ait` skill/command contract when operating the Task Graph;
- root `MEMORY.md` when present;
- active packets and `docs/decision-log.md` when present.

The workspace is supplied by the current repository. Do not hard-code a
project path or assume that an old status document is authoritative.

## Adoption boundary

Preserve dirty work, active writable owners, and existing ownership until an
explicit handback exists. Reconcile claims against current files, HEAD,
working-tree state, tests, runtime evidence, packet history, and decision-log
records.

Before preparing any dispatch, inspect `ait config`, `ait status`,
`ait list --long`, and `ait ready --type task`. Reconcile the target GATE/task
with exactly one AIT node, its parent, blocker edges, priority, claim, and
packet ID. Do not dispatch writable or delegated work when the database is
uninitialised, unavailable, or inconsistent; stop with `BLOCKED` or
`RECONCILE_REQUIRED` until the graph is repaired.

Reconcile what is already open before opening anything: re-claim or cancel
issues held by archived seats, close containers whose children are all
terminal, cancel work the plan no longer contains, and write `AIT open: N —
reconciled <date>` in `MEMORY.md` (`framework/issue-policy.md`, Closing).

If takeover follows a Lead handoff, record whether it is
`BATCH_CLOSEOUT_RESET` or `CONTINUATION`. For a batch reset, verify that every
Gate in the declared batch is accepted and no writable Peer scope remains. For
continuation, verify the durable capsule, quiescence/revoke state, active Peer
dispositions, AIT claims, blockers, working-tree state, and next checkpoint.
Do not dispatch until successor preflight and ownership reconciliation are
complete.

If Human supplies a specific GATE or task below the common instructions, bind
that target and inspect only the dependencies required to judge it. Without a
target, inventory the active delivery surface and the dependencies that affect
takeover. Do not turn a task description into evidence or acceptance.

## Adoption outcome

Create or update the current-state `MEMORY.md`, active packets, and durable
decision records as required by the framework. Classify each active item with
evidence, owner, writable scope, SHA, dependency, blocker, UNKNOWN, and next
action.

Record the AIT graph snapshot and active issue IDs in `MEMORY.md` and the
packet. AIT is the delivery Task Graph; packet and decision-log records are
execution evidence and cross-scope decisions, not a parallel task list.

Open independent review or research only when it reduces a material
uncertainty. Use Paseo, keep review seats read-only, and reconcile their
findings by root mechanism before preparing rework.

This runbook is audit-and-prepare by default. It does not dispatch
implementation or create a final acceptance commit. A later execution Lead
must complete all required review and verification rounds, then create or
confirm the final acceptance commit before recording `ACCEPTED`.

## Stop conditions

Stop with `READY`, `RECONCILE_REQUIRED`, `BLOCKED`, or `ESCALATION_REQUIRED`
when takeover state, evidence, ownership, or authority cannot be established.
