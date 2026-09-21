# Room Protocol — shared law

Protocol version: 1. Shipped verbatim into every adopted project as
`framework/protocol.md`; never edited inside a project. Everything a single
repository needs to add or pin lives in that repository's
`WORKSPACE_PROTOCOL.md`, which the Lead reads first. Peers read neither file:
their contract is the seat role plus the dispatch prompt.

## Authority

Lead is deep on room ownership and acceptance; Peer is deep on task-local judgment.

- Human owns intent, priority, external commitments, and irreversible trade-offs; Human is
  not a runtime node. Intent reaches the Lead as an intent brief (`framework/briefs/intent.md`)
  from the seat named in its `Report to` line; the Lead commits it as `docs/intents/<id>.md`
  before its first dispatch and reports to that seat only at batch closeout, continuation
  handoff, `DECISION_REQUEST`, and `DECISION_NOTICE`. Human prompts the Lead directly only for
  a bounded task that needs no discussion, and never prompts a Peer.
- One active Lead-of-record owns the Room's planning, staffing, integration, and acceptance.
  For a Peer, the Lead's binding instruction prevails except a Safety stop.
- There is no layer between Lead and Peer: the Lead never creates a seat that plans, staffs, or
  accepts on its behalf. A batch too large for one Lead context is a continuation handoff.
- Peer dispositions and execution behavior are defined in the Peer seat's own role contract
  and the dispatch prompt, not in a project file.

## Task classes → staffing

- Operational / runtime (start a stack, keep a worker live, collect a log, run a check): one
  seat, direct prompt, `Write scope: NONE` or artifacts only. No brief commit, no AIT issue, no
  worktree. If it produces a finding that needs code, that finding opens a task.
- Docs-only or single-file mechanical: one Peer on the working branch, or the Lead's own
  labeled correction commit when the fix is deterministic. AIT optional.
- Tiny / bounded code change, one writer: one Peer; AIT issue (the claim); worktree only when a
  second writer is active on the checkout or the shared checkout must stay green.
- Epic / feature group: the Lead plans it as a sequence of Peer dispatches, disjoint scopes in
  parallel in separate worktrees, overlapping scopes in series; never a delegated planner.
- Cross-module / lifecycle-sensitive: scout first when the foundation is unclear; one Peer
  with an isolated write scope and dual-lane review on the stable candidate.
- Difficult issue without a settled product or architecture route after inspection: Lead uses
  `dual-seat-adjudication`; Human decides irreversible trade-offs after Lead binds one verdict.
- Novel design with no settled convention to inherit: blind design — 2–3 Peer design lanes,
  blind to one another, one artifact per lane; Lead converges and binds one design; Human
  reviews the converged choice when it is expensive to reverse.
- A material review question on a stable implementation uses the three-lane review path.

Size for agents, not for a human team: one strong seat finishes most features in one sitting,
so the default is one task for the whole outcome. Split only for a reason you can name —
write sets that do not overlap and can run in parallel, a mechanical fan-out too large for one
sitting, a separately accepted deliverable — never by layer, by phase, or to keep an
intermediate state compiling. A contract changes together with every caller and test in one
scope. Some paths are serial by nature and never sit in two concurrent write scopes: lockfiles,
migrations and schema registries, generated code and its inventory, project settings, scenes
and binary assets; `WORKSPACE_PROTOCOL.md` may extend the list.

Ceremony follows what it protects, and the Lead decides: an AIT issue holds a claim across seats
and compaction; a worktree separates concurrent writers; a packet-open commit freezes a brief for
a batch. When none of those risks is present, none of those artifacts is owed. The Lead records
the choice in one line of the handback or `MEMORY.md` (`ceremony: none — single-seat ops task`)
so it stays auditable. Omitting ceremony is never a reason to skip the handback capsule or the
evidence a claim needs.

## Review ladder

Escalate only as far as risk requires; every Peer handback receives Lead review. The escalation
test is uncertainty, blast radius, and reversibility (`framework/provider-routing.md` → Rules) —
never file count, duration, or a file's perceived importance. A mechanical, verifiable,
easily-reversed change (docs contraction, dedup, a one-line config swap) stays at Lead handback
review even when it touches a load-bearing file.

1. **Lead handback review** — always; routine bounded work stops here. A corrections pass
   after any lane is confirmed here too: Lead reads the correction commit and re-runs only the
   affected evidence; a lane re-runs only for a HIGH finding whose correction changes a mechanism.
   Every lane scores against the intent brief's acceptance checks and invariants; a finding
   outside them is an observation (→ `docs/DEFERRED.md` or the next brief), not a blocker,
   unless HIGH for safety, security, or data loss. A deterministic fix needing no new
   verification (house style, a typo) is Lead's own labeled correction commit, not a round trip.
2. **Dual lane** — risk-proportional independent review of a stable candidate below the
   material-review threshold.
3. **Three lanes** — material review question on a stable implementation.
4. **Council** — only when `dual-seat-adjudication` leaves a consequential decision unresolved,
   or when Human explicitly requests it.

Review lanes read the object (`git diff "$sha^" "$sha"`); they do not run the project gate. A
lane runs a test only to reproduce a specific finding it is about to report.

## Ownership and evidence

- One writer per moving scope; concurrent writers use separate worktrees with disjoint scopes.
  This governs edit ownership, not commit count: commit by logical change and squash related
  candidate commits before acceptance — see `framework/commit-policy.md`.
- Where new code lands is bound by `framework/module-boundaries.md`: one responsibility
  per file, size bands as a look-signal not a target. Lead attaches it to any dispatch that
  grows an existing file, and audits the candidate with `framework/tools/file-size-audit.sh`.
- Candidate commits stage only assigned source paths; never stage evidence paths such as
  `MEMORY.md`, `docs/exec-plans/`, or `docs/decision-log.md`.
- Reviews run only on a stable candidate SHA and are read-only. Runtime capability never
  grants authority; read-only dispositions are behavioral law.
- No silent finish: durable handback records base/candidate SHA, changed boundary, commands
  and results, blockers, UNKNOWNs, and next action; the Peer then ends its turn with the
  `PEER_HAND_BACK` capsule as its final message, and delivery to Lead is automatic. Peers
  carry no seat ids and prompt no seat; a mid-task signal is an early final message.
- `close` is a graph signal, not acceptance. Only Lead records `ACCEPTED` after required review.
- Every claim carries command or observation, actual result, and SHA; a material UNKNOWN is
  never PASS. Cluster findings by root mechanism; reopen a failed foundation.
- `dcg` must be on PATH before full-access dispatch; otherwise the workspace is `BLOCKED`
  with `SAFETY_GUARD_MISSING`.

## Verification and the project gate

- Verification is proportional to change surface, risk, and cost: the Lead chooses the
  narrowest feedback loop that can answer the current question and broadens it when the
  change crosses an integration boundary. Full verification is evidence for a converged
  candidate or a deliberately system-wide change, not an automatic step after every dispatch.
- Gate evidence binds to the tree, not to the seat. A result is `(command, tree hash
  `git rev-parse <sha>^{tree}`, log path, exit code)`. Any seat cites it; no seat repeats a
  gate that already has a readable green log for the same tree and command. A squash or
  rebase that leaves the tree hash unchanged carries the evidence with it; a comment-only or
  docs-only delta needs build and vet, not the suite.
- The full gate runs **once per batch**, on the landing tree, by one seat the Lead names
  (the implementer that already holds the runtime, or a verify dispatch), detached with its
  output and real exit code written to the gate log path `WORKSPACE_PROTOCOL.md` names. The
  Lead reads the log; the Lead does not run a command expected to exceed ten minutes.
- A red package whose failure reads as timeout or shared-resource contention is re-run alone
  at the same tree. Green there closes that package; the full suite is not relaunched. Both
  logs are cited. A red that reproduces alone is a finding.
- A gate whose log is lost (process cut, output missing) is `UNKNOWN`, not a failure; relaunch
  it detached with logging before anything else is concluded.
- Every `WORKSPACE_PROTOCOL.md` names the canonical gate entry point, its expected duration,
  the flags that avoid self-contention, and the gate log path. Without that section the Lead
  treats the gate as unknown and asks.

## Task graph

- One AIT issue per dispatched writable task; Lead owns dispatch claims, and a Peer updates and
  closes only its own issue. Read-only, operational, and docs-only dispatches carry an issue
  only when the Lead wants the claim (see Task classes). The database lives in the main
  checkout only; a dispatch into a worktree names `--db <main>/.ait/ait.db`.
- An issue closes in the turn its work ends (Peer at handback, Lead at acceptance, epic at
  closeout); closeout is incomplete while the brief's epic has an open child —
  `framework/issue-policy.md`, Closing.
- Classify by lifecycle, not by domain or phase: create a container only when a child needs
  it, and never re-file by moving an issue — see `framework/issue-policy.md`.

## Routing

- `framework/provider-routing.md` is the default route table; `WORKSPACE_PROTOCOL.md` pins
  override it inside the repo, and a `Human override:` line in a brief overrides for that batch.
- Every `create_agent` sets `settings` (`modeId`, `thinkingOptionId`, `features`) directly
  from that provider's row in `framework/provider-routing.md` → Access modes; a seat created
  without them is `RECONCILE_REQUIRED` and is corrected with `update_agent` before its first
  prompt lands.
- Inspect requested and effective routing; mismatch is reported fail-closed, never silently substituted.

## Signals

`REOPEN_REQUEST` premise/foundation fails · `DEPENDENCY_REQUEST` needs another owner/contract ·
`BLOCKED` lacks authority/prerequisite/external state · `RECONCILE_REQUIRED` contradicts observed state ·
`DECISION_REQUEST` a Human-class decision (product, priority, external effect, irreversible trade-off),
sent upward by the Lead-of-record along the route the Human has set ·
`DECISION_NOTICE` a decision the Lead has already bound outside the brief, on a frozen artifact,
or replacing an automated mechanism — non-blocking, five lines.
Every signal carries evidence, current snapshot, and the smallest decision needed.

## Evolution

Human approves authority changes here; this file changes in the canonical framework repo and
is re-shipped, never patched per project. Repo-local law goes to `WORKSPACE_PROTOCOL.md`.
