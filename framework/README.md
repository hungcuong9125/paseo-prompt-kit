# Delivery Framework Guide

Reusable bundle copied into each project at bootstrap. One live contract per
layer; nothing here is duplicated elsewhere.

## Layers

```text
framework/protocol.md   shared room law, shipped verbatim, never edited in a
                        project: authority, task classes and ceremony, review
                        ladder, evidence, gate rules, task graph, signals.
WORKSPACE_PROTOCOL.md   per-repo (<80 lines): identity, routing pins, the gate
                        recipe and log path, repo-local gates and procedures.
                        Lead reads both before orchestrating and after every
                        compaction; Peers read neither.
Seat role contracts     lead and peer system prompts — delivered to each seat
                        runtime by the framework installer; not a file in
                        this repo; the only source of role behavior.
framework/briefs/       intent brief (intent.md: the Lead's charter,
                        committed as docs/intents/<id>.md), dispatch skeleton
                        (dispatch.md: Lead→Peer), and attachments Lead points
                        at by path (review.md, design.md).
framework/provider-routing.md  default route table; protocol pins override.
framework/packet-template.md   task card + evidence record.
framework/commit-policy.md     commit-by-logical-change, squash-before-accept.
framework/issue-policy.md      when to create an initiative, epic, or task.
framework/module-boundaries.md where new code lands; one responsibility per
                        file, size bands as a look-signal, anti-fragmentation.
framework/tools/        measurement scripts Lead runs for evidence
                        (file-size-audit.sh).
framework/MEMORY.template.md, decision-log.template.md  copied once at
                        bootstrap; never live state.
framework/runbooks/     optional procedures; not an authority layer.
Task prompt             the concrete assignment; gets the most attention.
```

Skills: always-on sets live in each seat; everything situational is in the
shared library (`~/.config/room-workflow/skills-library/`, see its
`INDEX.md`) and is attached by path in the dispatch prompt. A project may also
keep project-local skills (for example `.agents/skills/`) for business-specific
workflows; this project-owned surface is not synced by the framework installer
and is not part of the shared skills library, and remains bound by the current
role/protocol contract. It lets a project customize without inflating global
seat profiles or turning a one-off need into a framework-wide contract.

The meta-repo's `docs/` is design-reference-only material for evolving this
framework (research notes, chat transcripts, and staging drafts) and is never
auto-shipped to an adopted project. Adoption delivers this bundle —
`AGENTS.md`, `WORKSPACE_PROTOCOL.md`, `framework/`, and the `docs/` planning
bundle when present — plus whatever the canonical repo's adoption
instructions explicitly name.

## Adoption boundary

This framework is a plugin, switched at the adoption boundary: a project
either adopts this bundle and runs Rooms, or it does not. Inside an adopted
project there is still one contract, applied in proportion: `protocol.md`
Task classes says which artifacts (AIT issue, worktree, packet-open commit)
a task owes, and the Lead decides per task and records the choice. An
operational task or a one-file fix owes none of them; that is the same
contract applied to a small risk, not a second mode. Never encode a "lite"
variant or a dual path; proportion is a Lead decision, not a file.

## Read order

- Lead: the intent brief it was created with, `framework/protocol.md`,
  `WORKSPACE_PROTOCOL.md`, then `MEMORY.md`, packet, decision log — again
  after every compaction.
- Peer: nothing here — seat role + dispatch prompt + attached paths.

## Binding rules

- `framework/protocol.md` owns shared law; `WORKSPACE_PROTOCOL.md` owns repo
  tactics, routing pins, and the gate recipe.
- `ait` owns the task graph; packets store the issue id, never a second graph.
- `MEMORY.md` is a short current-state takeover index with one writer (Lead);
  history rotates into `docs/exec-plans/{active,proposed,done}/`; cross-scope decisions append to
  `docs/decision-log.md` with an index block on top.
- `docs/DEFERRED.md` is the register of items ruled "not now": one row per
  `DEFER` ruling, `DEF-nnn` ids, Lead-written, never deleted. A DLF entry cites
  the `DEF-nnn`; the row carries the observable revisit trigger.
- The Human task message supplies the objective; it does not override
  authority, ownership, evidence, or acceptance rules.
- Keep one live contract: no legacy aliases, dual paths, or parallel role
  variants.
- `one writer per scope` governs edit ownership, not commit boundaries; commit
  by logical change and squash before acceptance per `commit-policy.md`.
- The reusable contract is `framework/protocol.md` + `WORKSPACE_PROTOCOL.md` plus the `packet`, `plan`,
  and `decision-log`. Project-specific filenames such as `ARCHITECTURE.md`,
  `PLANS.md`, `ROADMAP.md`, `RUNTIME.md`, `NETCODE.md`, and `CONTENT.md` are
  optional and subordinate to the protocol; this template does not require a
  universal document tree. When present, `docs/process/DEVELOPMENT.md` is a
  project-owned optional lane/proof document, not a global requirement.
- The meta-repo's anti-pattern catalogs are a research/search lens for people
  evolving this framework, not runtime input and not shipped here.
