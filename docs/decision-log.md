# Decision Log

Durable cross-scope delivery decisions for this project. This file is
append-only. It is not a status page, not a task list, and not a transcript of
how a decision was reached — that belongs to the packet in
`docs/exec-plans/{active,proposed,done}/`.

Each locked decision gets its own evidence commit; evidence commits are
Lead-only and never combined with code commits.

## Current index

- `DLF-002` — Batch topology: foundation task, then client ∥ server in worktrees, then qa+release — ACTIVE
- `DLF-001` — Adoption: git on `main`, origin bound, research paths ignored, AIT prefix `pk` — ACTIVE

## Entries

### DLF-001 — Adoption bootstrap and publication boundary

- Decided at: 2026-09-21
- Decision owner: Lead (claude-lead, claude-fable-5-1)
- Packet ID / AIT issue ID: paseo-prompt-kit-mvp / pk-UkLWZ
- Commit SHA at decision: packet-open commit (this evidence commit)

**Production behavior.** The repository is a Git project on branch `main` with `origin` = `https://github.com/hungcuong9125/paseo-prompt-kit`. `.gitignore` excludes `docs/IMPELEMENT_PLAN.md`, `upstreams/`, `.ait/`, `.logs/`, `artifacts/`, `.worktrees/`. Governance artifacts (`docs/intents/`, `docs/decision-log.md`, `docs/exec-plans/`, `docs/DEFERRED.md`, `MEMORY.md`, `WORKSPACE_PROTOCOL.md`, `framework/`, `AGENTS.md`) are tracked. AIT database initialised with prefix `pk`.

**Evidence source.** `git check-ignore -v docs/IMPELEMENT_PLAN.md upstreams/paseo/package.json .ait/ait.db` → all three matched by `.gitignore` rules 2, 3, 6. `git ls-remote --heads https://github.com/hungcuong9125/paseo-prompt-kit` → exit 0, no heads (empty remote). `ait init --prefix pk` → `{"created":true,"schema_version":4}`.

**Reversal condition.** Human changes the remote or wants plan material published; then the ignore rules and remote change in a new DLF.

**Supersedes / superseded by.** NONE

### DLF-002 — Batch topology and frozen-contract boundary

- Decided at: 2026-09-21
- Decision owner: Lead
- Packet ID / AIT issue ID: paseo-prompt-kit-mvp / pk-UkLWZ.1–.4
- Commit SHA at decision: packet-open commit

**Production behavior.** Work lands as four tasks. `pk-UkLWZ.1` (serial, on `main`) produces the plugin skeleton, `shared/**` contracts (settings schema, RPC contract, action registry types, protected-literal rules), the gate script, and two spikes proving Composer read/replace and temp-agent rewrite round-trip. Its acceptance SHA freezes `shared/**`, `package.json`, `paseo-plugin.json`, `index.client.tsx`, `index.server.ts`. `pk-UkLWZ.2` (write scope `client/**`, `index.client.tsx`) and `pk-UkLWZ.3` (write scope `server/**`, `index.server.ts`) run in parallel in separate worktrees; a change they need in a frozen path is a `DEPENDENCY_REQUEST` to the Lead, never an edit. `pk-UkLWZ.4` integrates, runs the QA matrix, the single full gate, and the install checks.

**Evidence source.** Plan §6 layout (client/ server/ shared/ split) and upstream `packages/plugin/src/{client,server}/contracts.ts` confirm client and server are separate runtimes joined only by typed RPC, so their write sets are disjoint once `shared/**` is frozen.

**Reversal condition.** If `pk-UkLWZ.1` shows the RPC/settings contract cannot be fixed before client and server exist, `.2` and `.3` collapse into one seat and the worktree split is dropped.

**Supersedes / superseded by.** NONE
