# Decision Log

Durable cross-scope delivery decisions for this project. This file is
append-only. It is not a status page, not a task list, and not a transcript of
how a decision was reached — that belongs to the packet in
`docs/exec-plans/{active,proposed,done}/`.

Each locked decision gets its own evidence commit; evidence commits are
Lead-only and never combined with code commits.

## Current index

- `DLF-006` — pk-UkLWZ.3 ACCEPTED at f7e27ed (tree df54e01cb07c17c5b67c8b4f2da13315a4a7f2aa); validator fail-closed; injection boundary — ACTIVE
- `DLF-005` — PromptKit control placement: official `addComposerPill` only (one pill per agent, menu); DOM toolbar button dropped — ACTIVE
- `DLF-004` — Human directive: bug-scanner pass + MultiZen browser QA bound to pk-UkLWZ.4 — ACTIVE
- `DLF-003` — pk-UkLWZ.1 ACCEPTED at 76992b4070ed38c76befd9d18a623c3f907b78d7; target Paseo 0.8.0; settings snapshot travels in rewrite RPC — ACTIVE
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

### DLF-003 — pk-UkLWZ.1 accepted; Paseo 0.8.0 is the target; shared contracts frozen

- Decided at: 2026-09-21
- Decision owner: Lead
- Packet ID / AIT issue ID: paseo-prompt-kit-mvp / pk-UkLWZ.1
- Commit SHA at decision: 76992b4070ed38c76befd9d18a623c3f907b78d7 (tree 0de83b0e2bab3b15e455951a43ce2b883ccf8f1a)

**Production behavior.** The plugin targets the installed Paseo 0.8.0 (`@getpaseo/plugin` 0.8.0, `@getpaseo/client` 0.8.0); `paseo-plugin.json` carries only `id` and `requirements.paseo: ">=0.8.0"` as written by `paseo plugin init`. Because 0.8.0 `registerSettings` returns `void`, the client sends its persisted settings snapshot inside `prompt-kit.rewrite` input and the server re-validates it with the same zod schema; an incomplete or unavailable dedicated selection fails closed (`invalid_selection` / `invalid_model`). The temporary agent is archived in `finally`; `archive()` stops an in-flight turn (client `dist/daemon-client.js:1517-1538`). `shared/**`, `package.json`, `paseo-plugin.json`, `tsconfig.json`, `vitest.config.ts` are frozen for pk-UkLWZ.2/.3.

**Evidence source.** Gate log `artifacts/gates/0de83b0e2bab3b15e455951a43ce2b883ccf8f1a.log` REAL_EXIT:0 (48 tests). Lead probe on the object: six prose lines yield no protected literal; commands/paths/URLs/model names still extracted. `node_modules/@getpaseo/plugin/dist/server/contracts.d.ts:11` → `registerSettings(...): void`. Peer handback 02:09Z.

**Reversal condition.** A Paseo release where `registerSettings` returns a readable settings handle → the snapshot leaves the RPC input (new DLF). Selector `[data-testid="message-input-root"]` or `textarea[data-composer-input]` disappears → REOPEN on the composer adapter.

**Supersedes / superseded by.** NONE

### DLF-004 — Human directive: bug-scanner pass and MultiZen browser QA

- Decided at: 2026-09-21
- Decision owner: Human (directive), bound by Lead into pk-UkLWZ.4
- Packet ID / AIT issue ID: paseo-prompt-kit-mvp / pk-UkLWZ.4
- Commit SHA at decision: 76992b4070ed38c76befd9d18a623c3f907b78d7

**Production behavior.** pk-UkLWZ.4 runs `/Volumes/DataSSD/HomeWork/TOOLS/ultimate_bug_scanner` over the whole project once the MVP candidate is ready, without installing anything or editing source in the same pass; it records command, log path, exit code, and tree SHA. The Lead triages findings against the acceptance checks before closeout. Browser QA uses MultiZen profile `20def08f-9a62-4932-9d49-f7c5ab12c6d0` only when the MCP client is available to the seat; tokens never enter the repo, briefs, logs, or prompts; an unavailable MCP is recorded as BLOCKED/UNKNOWN, never simulated.

**Evidence source.** Human directive text appended verbatim to `docs/intents/paseo-prompt-kit-mvp.md`.

**Reversal condition.** Human withdraws the directive.

**Supersedes / superseded by.** NONE

### DLF-005 — Control placement: `addComposerPill` is the only placement

- Decided at: 2026-09-21
- Decision owner: Lead (DEPENDENCY_REQUEST from pk-UkLWZ.2)
- Packet ID / AIT issue ID: paseo-prompt-kit-mvp / pk-UkLWZ.2
- Commit SHA at decision: f24592b1d515ba8b0fbb83bc586b40f6ebdd9a33

**Production behavior.** The plugin registers one Composer pill per live agent through `client.addComposerPill({ workspaceId, agentId, button: { behavior: { kind: "menu", items } } })`, items built from the shared action registry. The pressed pill supplies the `workspaceId`/`agentId` sent to `prompt-kit.rewrite`. The DOM adapter (`client/composer/web.ts`) only reads and replaces the Composer text; when the visible Composer does not belong to the pressed pill's agent, the rewrite result is discarded and a message is shown. No DOM-injected button exists.

**Evidence source.** `node_modules/@getpaseo/plugin/dist/client/buttons.d.ts`: `PluginComposerPillContribution extends PluginHeaderButtonContribution { agentId }`, `PluginHeaderButtonContribution { id; workspaceId; button }`. Peer 49d1e9f6 handback 2026-09-21: no focused/active-agent accessor in `@getpaseo/plugin` or `@getpaseo/client` 0.8.0 dist; Composer subtree carries no identity attributes.

**Reversal condition.** A Paseo release exposing a focused-agent accessor or a public Composer text API to plugins; then placement is revisited in a new DLF.

**Supersedes / superseded by.** Refines DLF-002 (client scope unchanged). Plan §2.2/§10 DOM-primary placement is not followed.

### DLF-006 — pk-UkLWZ.3 accepted: server rewrite engine

- Decided at: 2026-09-21
- Decision owner: Lead
- Packet ID / AIT issue ID: paseo-prompt-kit-mvp / pk-UkLWZ.3
- Commit SHA at decision: f7e27ed (squash of 30a8868, 08b0bc0 from task/pk-UkLWZ.3; tree df54e01cb07c17c5b67c8b4f2da13315a4a7f2aa)

**Production behavior.** `server/output-validator.ts` accepts only text that is the rewritten prompt: non-empty, ≤ 20 000 chars, fence-balanced, no full markdown envelope, no meta preface/refusal/commentary first line, every protected literal of the original present; anything else is a typed error and the Composer is never replaced. Catalog read failures map to `invalid_model`. `shared/prompts/coding.ts` treats `<user_prompt>` content as untrusted, escapes wrapper delimiters, and forbids commentary. Temporary agent archived on ok/error/timeout.

**Evidence source.** Peer 613157ea handback 2026-09-21 02:4xZ: typecheck REAL_EXIT:0; `npm test` REAL_EXIT:0 (93 tests); live-daemon 9/9 — current model temp agent 503dee62… archived 02:41:17Z, dedicated `pi-peer/workbuddy/hy4-preview-f` df2c2422… archived 02:41:26Z, invalid model → `invalid_model` with no agent, timeout 23b33095… archived 02:41:28Z, injection canary absent, plugin logs contain no prompt text. Lead read validator, prompt, rewrite/generation diffs from the object.

**Reversal condition.** A model whose legitimate rewrites routinely start with a phrase in META_PREFACE/COMMENTARY → narrow the vocabulary (new DLF). Client 0.8.0 exposing a truncation signal on `lastMessage` → replace the indirect length/fence heuristics.

**Supersedes / superseded by.** NONE
