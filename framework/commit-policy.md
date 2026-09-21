# Commit Policy

This room has no Pull Request mechanism: Peers commit directly to the working
branch; the handback + Lead acceptance step is this room's review boundary,
not a PR. The rules below adapt standard commit hygiene to that reality.

## The one rule that gets misread

`one writer per scope` (`framework/protocol.md`) governs **edit ownership** —
who may touch a path right now. It does not mean **one commit per scope**,
per task, per agent, or per file. Confusing the two turns every multi-step
task into a trail of noise commits (`fix`, `fix again`, `typo`, `update
README`) that nobody can read back later.

## Commit by logical change

A commit should answer: *if someone reads only this commit, do they
understand what changed and why?*

- Checkpoint freely while working — WIP commits, fixup commits, corrections
  after a review finding, are normal and expected mid-task. A correction
  commit is normally the Peer's; the Lead authors one only for a deterministic
  fix needing no new verification, labeled as such, and it folds the same way.
- Before handback, a Peer's candidate commit(s) should still only touch its
  assigned `change_boundary` (packet-template.md) — that part of `one writer
  per scope` stands.
- Do not gate commit count. A single commit hiding five unrelated changes is
  worse than eight commits that are each one real step; the count itself
  proves nothing.

## Squash before acceptance

When a task or epic accumulates multiple candidate/correction commits that
are really one logical change (e.g. an implementation commit plus a
follow-up fix for something the reviewer caught), the Lead folds them into
one logical commit as part of recording the final acceptance commit —
`git reset --soft` + recommit, or interactive rebase, whichever is cleanest —
**only when none of those commits have been pushed to a shared/remote branch
or reviewed by Human outside this room.** Once shared, do not rewrite;
acceptance then happens as a new commit on top, same as any other correction.

Acceptance of unshared work is a squash, not a merge ritual. A no-ff merge
that wraps a single candidate commit is the same noise doubled and is a
policy violation, not an acceptance commit. A merge commit is valid only when
the merged branch carries multiple commits that are each independently
meaningful on their own.

When the Human rejects a deliverable whose commits are still unshared, rewind
those commits before dispatching the rework — verify with
`git branch --contains <sha>` that no other seat's active branch holds them
first — so the rework lands as one clean commit. Stacking a correction on top
of a rejected, unshared commit leaves the rejected version permanently in
history for no reason.

If the adopted project uses GitHub Pull Requests on top of this room's
workflow, the same principle maps onto squash-merge: many commits on the
branch, one logical commit (or a small deliberate few) lands on the base
branch. Prefer squash merge by default; keep multiple commits only when each
one is independently meaningful and reviewable on its own.

## Commit messages

`<type>: <short description>` — `fix`, `feat`, `docs`, `refactor`, `test` are
enough; Conventional Commits scopes are optional, not required ceremony.

## Never rewrite shared history

Do not rebase, squash, or force-push a branch that another agent or Human is
already using or has already reviewed externally. Squash-before-acceptance
above only applies to this room's own not-yet-shared candidate commits.
