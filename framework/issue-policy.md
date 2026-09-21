# Issue Policy

`ait` owns the task graph (`framework/README.md`). This file says **when** to
create an `initiative`, an `epic`, or a `task` — the decision that otherwise
gets made subjectively, differently in every project. Command syntax, seat
permissions, and output contract stay in the `ait` skill and are not repeated
here.

## The one rule that gets misread

The tree is a **lifecycle** structure, not a **taxonomy**. Every node carries a
status, a priority, a claim, and blocker edges — so a node must be something
that starts and finishes.

Two things people keep trying to turn into tree levels, and must not:

- **Domains** — backend, frontend, database, api. A domain never starts and
  never closes. It belongs in the title as a prefix (`[web] ...`), found with
  `ait search`, and it composes (`[web][db]`) where a single-parent tree
  cannot.
- **Phases** — design, implement, review, verify. These are the life of one
  task, recorded with `ait note add`, not children of it. A review round
  becomes its own task only when a different seat owns it under a different
  write scope.

## Create a container only when a child needs it

Never create a parent ahead of its children. Structure grows upward out of
real work, not downward from a picture of how the work ought to look.

- **task** — the default, and the unit of dispatch: one owner, one write
  scope, one handback. Most work is a plain task and needs no parent at all; a
  top-level task is normal, not a loose end.
- **epic** — created at the moment a *second* task has to be coordinated with
  the first: they share one exit condition and a dependency order. An epic
  with one child is a task with extra ceremony.
- **initiative** — created at the moment a *second* epic shares a "why" that
  someone must re-read to decide correctly inside either one. Rare. Several
  may be open at once; "one initiative per project" is not a rule.

Both container types exist in order to be closed. If you cannot state the
condition that closes it, it is not an issue.

## Sizing a task

Split into two tasks when there are two independent decisions, or two disjoint
write scopes. Do not split by file, by phase, or to give each seat something to
hold — that is staffing, and the tree does not model staffing (`ait` skill,
"Bookkeeping, not staffing"). Subtasks go one level deep at most.

## Closing

An issue closes in the turn its work ends, by the seat that ended it.

| Node | Created by | Closed by |
|---|---|---|
| task | Lead before dispatch, claimed to the Peer | Peer at handback (note = candidate SHA); Lead at acceptance if still open |
| epic | Lead when a second task needs coordinating | Lead at batch closeout, `--cascade` only once every child is terminal with its own note |
| initiative | Lead when a second epic shares a "why" | Lead when its last epic closes |

- `REOPEN_REQUEST`, `BLOCKED`, `DEPENDENCY_REQUEST` leave the issue open with
  the signal in a note until the Lead rules; descoped work is `cancel`led with
  a note naming the `DEF-nnn` row or the next brief.
- Closeout is incomplete while the brief's epic has an open child. A handoff
  capsule lists every open issue with its holder; a claim held by an archived
  seat is `RECONCILE_REQUIRED`.
- `MEMORY.md` carries `AIT open: N — reconciled <date>`.

## Structure is expensive to undo

`ait update --parent` is rejected: an issue cannot be moved after it is
created. Correcting a misfiled issue means creating it in the right place and
closing the old one with a note pointing at the new id. So a wrong container is
paid for permanently, while a missing one costs a single `create` later — when
unsure, do not create the container.
