# Decision Log

Durable cross-scope delivery decisions for this project. This file is
append-only. It is not a status page, not a task list, and not a transcript of
how a decision was reached — that belongs to the packet in
`docs/exec-plans/{active,proposed,done}/`.

Each locked decision gets its own evidence commit; evidence commits are
Lead-only and never combined with code commits.

## Current index

- `DLF-015` — Third rewrite path: direct API transport over `openai`/`anthropic`/`gemini`; keys via `apiKeyEnv` + `secrets.json`, never in the settings document; routing split into `modelMode` × `transport` — ACTIVE
- `DLF-014` — The two rewrite paths separated: current path reads the model the Composer shows (`runtimeInfo.model` first), dedicated path unchanged; daemon's 30s plugin-RPC cap measured and recorded as DEF-008 — ACTIVE
- `DLF-013` — HUMAN_DIRECTIVE: live probes and smoke tests use cheap models; a probe never spends a frontier call — ACTIVE
- `DLF-012` — Rewrite transport replaced: temporary Paseo agent → headless CLI of the agent's own provider; `server/generation.ts` deleted; new `unsupported_provider`/`spawn_failed` errors; settings gain `providerCli` — ACTIVE
- `DLF-011` — Release 0.1.0 prep ACCEPTED: RC 94e9a9a (tree 94cfc8f3…), local tag v0.1.0, host loads plugin, browser rows PASS with MultiZen; push/tag left to Human — CLOSED
- `DLF-010` — Client entry never loaded in the host (default export undefined at snapshot); fix + host-load regression test + re-QA bound into release batch; RC moves off e15d0a6 — ACTIVE
- `DLF-009` — Human decisions after closeout: license MIT (DEF-004 TAKEN_UP), tag v0.1.0 + npm deferred (DEF-005 TAKEN_UP), MultiZen now reachable from the Lead runtime (DEF-003 stays OPEN until a QA batch) — RECORDED, not yet executed
- `DLF-008` — Batch paseo-prompt-kit-mvp ACCEPTED at landing 71b1b5f (tree 9fd26b04…); F2 Git-install fix; scanner triage; browser QA BLOCKED (no MultiZen seat) — CLOSED
- `DLF-007` — pk-UkLWZ.2 ACCEPTED at 32c77c0 (tree 7b1805892aa9b0d875d9cc12ec1bb5afbd51aac7 after merge with .3); pills per agent, guarded rewrite, settings screen — ACTIVE
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

### DLF-007 — pk-UkLWZ.2 accepted: client pills, guarded rewrite flow, settings screen

- Decided at: 2026-09-21
- Decision owner: Lead
- Packet ID / AIT issue ID: paseo-prompt-kit-mvp / pk-UkLWZ.2
- Commit SHA at decision: 32c77c0 (squash of 605ea5b from task/pk-UkLWZ.2; merged tree 7b1805892aa9b0d875d9cc12ec1bb5afbd51aac7)

**Production behavior.** One Composer pill per live agent (`addComposerPill`, menu from the action registry), added/removed from the daemon agent directory and all removed on plugin cleanup. The rewrite runner refuses on empty text, busy re-entry, invalid/incomplete/unlisted dedicated selection, agent removal, and stale Composer text; it replaces text only when the snapshot still matches, then restores focus; every refusal is an error surfaced by the host. Settings are read through the host settings RPC (`settingsRpc(promptKitSettings.id).read`) because 0.8.0 exposes `useSettings` only to React surfaces.

**Evidence source.** Peer 28e8376d handback 03:32Z: typecheck 0, `npm test` 0 (73), composer-dom 32 tests, 16-mutation battery all red. Lead on merged main: typecheck REAL_EXIT:0; unit+jsdom+composer-dom 109/109 (`/tmp/pk-merge-test.log`). Lead read `contribute.tsx`, `agent-pills.ts`, `rewrite-runner.ts`, `read-settings.ts`, `selection.ts` from the object.

**Reversal condition.** Live QA (pk-UkLWZ.4) shows the host does not surface a thrown `onPress` error to the user → the runner reports through a visible channel instead (corrections pass on the client scope).

**Supersedes / superseded by.** NONE

### DLF-008 — Batch closeout: pk-UkLWZ.4 accepted, F2 correction, scanner triage, browser QA status

- Decided at: 2026-09-21
- Decision owner: Lead
- Packet ID / AIT issue ID: paseo-prompt-kit-mvp / pk-UkLWZ (epic), pk-UkLWZ.4
- Commit SHA at decision: landing 71b1b5f81b1e2c2f37422665267a75dc4f4d92c0 (tree 9fd26b0499f096c4933786124ead0a825756fc53), pushed to origin/main

**Production behavior.** The published `main` installs into a Paseo 0.8.0 daemon both from the local directory and from Git (`paseo plugin install hungcuong9125/paseo-prompt-kit --ref 71b1b5f` and `--ref main` → `running`; live-daemon suite 9/9 against the Git install, temp agent dce8f1f4… archived 04:00:34Z). Server code derives Paseo types from `@getpaseo/plugin/server` (`server/paseo-types.ts`) because the managed Git checkout has no `node_modules` (F2). No `build` step and no install-time dependency install were added. README documents both install paths, settings, and limitations.

**Evidence source.** Gate `artifacts/gates/9fd26b0499f096c4933786124ead0a825756fc53.log` REAL_EXIT:0, 13 files / 118 tests, live-daemon project ran. QA matrix `artifacts/qa/qa-matrix-16ed058d….md` (code identical except server type imports): 14/16 PASS live, rows 11/12 PASS on jsdom+source, row 15 visual and row 16 theme UNKNOWN. HUMAN_DIRECTIVE scanner: `artifacts/scans/ultimate_bug_scanner-16ed058d….full.log` REAL_EXIT:1, critical=417 warning=55 info=1341 over 41 files; Lead triage: every critical is `package-lock.json` metadata (substring/loose-equality false positives); source hits are `settings-screen.tsx` hooks-deps/list-key false positives (no `.map`, deps array correct), `web.ts:20` non-null assertion behind a length check, `protected-literals.ts` dynamic RegExp by design (rules are data), `framework/tools/file-size-audit.sh` cd-without-exit (framework file, not project scope). None touches an acceptance check or a safety invariant; no fix owed. Browser QA: MultiZen MCP absent on pi-peer (`supportsMcpServers=false`) and on claude-peer (seat dd5dce81 saw only `WebFetch`) → recorded BLOCKED per the directive, never simulated (DEF-003).

**Reversal condition.** Human connects a MultiZen-capable seat → DEF-003 is taken up and rows 11/12/15/16 get UI evidence; a UI failure there reopens the client scope.

**Supersedes / superseded by.** NONE

### DLF-009 — Human decisions after closeout: MIT license, v0.1.0 tag, npm deferred, MultiZen reachable

- Decided at: 2026-09-21 (post-closeout DECISION_NOTICE from Supervisor bf776d78 carrying the Human's answers)
- Decision owner: Human
- Packet ID / AIT issue ID: none yet — to be executed in a new bounded release batch
- Commit SHA at decision: fcd1a7aaa0edd503058cdecdd7dcbaec0e77221d (origin/main)

**Production behavior.** The next release-owned change adds `LICENSE` (MIT) and `"license": "MIT"` in `package.json`, keeping attribution/license compatibility for any upstream-derived code (paseo-emoji pattern is MIT, Paseo is Apache-2.0; no code was copied, only patterns). Initial release tag is `v0.1.0`; npm publishing stays deferred for the MVP; the npm package name stays undecided (preferred `@<organization>/paseo-prompt-kit`, fallback `paseo-prompt-kit`); `private: true` remains until publishing is enabled. Browser QA, if the Human asks for it, runs as a new bounded batch using MultiZen profile 20def08f-9a62-4932-9d49-f7c5ab12c6d0; tokens never enter the repo, logs, briefs, or prompts. The accepted batch is not reopened.

**Evidence source.** DECISION_NOTICE text received 2026-09-21; Supervisor verified `multizen.list_profiles` returns the profile (isRunning=false) in the current runtime; the Lead runtime now lists `mcp__multizen-mcp__*` tools.

**Reversal condition.** Human changes the license, tag, or publishing decision.

**Supersedes / superseded by.** Takes up DEF-004 and DEF-005; DEF-003 remains open.

### DLF-010 — Client entry load defect found by browser QA; fix bound into the release batch

- Decided at: 2026-09-21
- Decision owner: Lead (DECISION_NOTICE sent to bf776d78)
- Packet ID / AIT issue ID: paseo-prompt-kit-release-0.1.0 / pk-OIJLh.3
- Commit SHA at decision: e15d0a683cdc1041722f8775b09eebf7bf42fdeb

**Production behavior.** `index.client.tsx` default-exports a function declaration so the host's eager module snapshot sees a function; a regression test bundles the entry like the daemon and asserts the export shape; browser rows A–H are re-run live; the full gate re-runs at the fixed tree; the local v0.1.0 tag points at the fixed commit.

**Evidence source.** Peer f57a7628 handback 2026-09-21 ~09:45Z: MultiZen session (22 tools, profile 20def08f-… isRunning=true) — 0 `PromptKit` DOM nodes, Settings → Plugins error `Plugin prompt-kit must default export a function`; bundle sha256 6cb70cb5…; repro script reproduced by Lead (`prompt-kit THROWS`, `fresh-worktrees OK`). Root cause: `export default contribute` re-export of an imported binding vs. host `__copyProps` eager read.

**Human evidence (2026-09-21).** Human reproduced in the Paseo host: https://app.paseo.sh/settings/hosts/srv_nk9P1ozSZzEY/plugins shows `prompt-kit` failed after reload with `Plugin prompt-kit must default export a function`; installed checkout `/Users/hungcuong/.paseo/plugins/prompt-kit/71b1b5f81b1e-bb636f59-ce62-464e-a5a9-d4db5b3b96f8/checkout` (Git install at 71b1b5f). Status: real host FAIL, not UNKNOWN. Release blocked until the entry fix lands, the host reload succeeds, and the affected browser rows are re-verified with real MultiZen evidence.

**Reversal condition.** Host loader changes to lazy getters → the test still passes; no reversal needed.

**Supersedes / superseded by.** Amends DLF-007 (client acceptance was jsdom-only; live load was UNKNOWN and is now FAIL→fixed).

### DLF-011 — Release 0.1.0 preparation accepted; host-load fix evidenced; local tag v0.1.0

- Decided at: 2026-09-21
- Decision owner: Lead
- Packet ID / AIT issue ID: paseo-prompt-kit-release-0.1.0 / pk-OIJLh (.1 release files, .2 QA-before, .3 fix + QA-after)
- Commit SHA at decision: release candidate 94e9a9a3c70f9a68a71017dca80739e221a122b7 (tree 94cfc8f30cb72e9a4d81381e1f33583e16d88c00); local annotated tag `v0.1.0` → 94e9a9a

**Production behavior.** `index.client.tsx` declares `export default function contribute(client)` (body folded from the deleted `client/contribute.tsx`); the host loads the plugin without an evaluation error. `LICENSE` (MIT), `package.json` `license: "MIT"`, README license/attribution present (e15d0a6). `tests/unit/client-entry-host-load.test.ts` bundles the entry with esbuild and evaluates it under the host's eager CommonJS interop, asserting the default export is a function (skips with a reason when no esbuild binary is found). Nothing pushed by agents; `origin/main` is still fcd1a7a.

**Evidence source.** Before: HEAD e15d0a6 / accepted code tree 9fd26b04…, host FAIL (`Plugin prompt-kit must default export a function`, Human-reproduced; repro `artifacts/qa/ui-20260921T092855Z/`). After: regression test RED on old entry (`regression-red.log` REAL_EXIT:1) → GREEN on 94e9a9a (`regression-green.log` REAL_EXIT:0); typecheck 0; gate `artifacts/gates/94cfc8f30cb72e9a4d81381e1f33583e16d88c00.log` REAL_EXIT:0, 14 files / 119 tests, live-daemon 9/9; directory install `running`. MultiZen (profile 20def08f-…), `artifacts/qa/ui-20260921T095604Z/`: (a) Settings → Plugins no error, `evaluationErrors` empty; (b) 1 PromptKit pill, 1 `Improve coding prompt` menuitem (`rowA1-pill-visible.png`); (c) reload → 1 pill (`rowC-after-reload-pill.png`); B rewrite replaced Vietnamese text, user turns 3→3, plugin log `rewrite success durationMs=9183`; C `Write a prompt first.`; D text kept + message; E other agent's Composer untouched; H dedicated model persisted / invalid refused. Row G (theme) dropped by HUMAN_PRIORITY_DIRECTIVE; profile theme left at `auto`. Lead viewed screenshots `rowA1-pill-visible.png`, `rowB-menu-visual.png`, `rowC-reload-menu-single.png`, `rowA0-settings-plugins-no-error.png`.

**Public state (Human-run push, 2026-09-21).** origin/main fcd1a7a..f07b0c6; `refs/heads/main` = f07b0c63cc87190b60bfdce16b577aac5381f7db; `refs/tags/v0.1.0` annotated, `refs/tags/v0.1.0^{}` = 94e9a9a3c70f9a68a71017dca80739e221a122b7. Release v0.1.0 is PUBLIC on https://github.com/hungcuong9125/paseo-prompt-kit. npm stays deferred.

**Reversal condition.** Human reports the pushed tag/branch differ from 94e9a9a, or a host release changes the interop loader → new DLF.

**Supersedes / superseded by.** Closes DLF-010; amends DLF-007 (client acceptance now host-proven).

### DLF-012 — Rewrite transport: temporary Paseo agent replaced by the provider's own headless CLI

- Decided at: 2026-09-21
- Decision owner: Lead, on a Human product directive ("gửi và nhận kết quả > rewrite lại là xong"; "CLI chạy Headless chỉ nhận kết quả")
- Packet ID / AIT issue ID: none yet — implemented on the main checkout at Human instruction; a packet is owed before any release
- Commit SHA at decision: working tree `c033eaf6e44d306ead1a22b260026ae1c424e7a0` on `main`, parent 1889333; not committed, not pushed

**Production behavior.** A rewrite no longer creates a Paseo agent. `server/generation.ts` (workspace `agents.create` → `waitForFinish` → `archive`) is deleted, so no tab opens, no agent appears in the daemon, and no agent is archived. `server/rewrite.ts` resolves the provider to a CLI family and `server/cli/runner.ts` spawns that CLI headlessly in an empty temporary directory, reads the answer from stdout, and deletes the directory in `finally`. `Current agent model` keeps its meaning: the provider id and model id come from the same agent snapshot, and the CLI that runs them is the CLI Paseo already runs that provider with. `Dedicated model` is unchanged too: the selected provider/model is validated against the daemon catalog and then run through that provider's CLI.

**CLI families.** `server/cli/family.ts` owns four: `pi`, `claude`, `codex`, `opencode`. A family owns its argv, its output parser, and how the prompt reaches the process. The prompt never appears in `argv` — `pi` receives an `@file` path, the other three receive stdin — so it is not readable from another user's `ps`. Every invocation disables ambient context and tool use: `pi --no-tools --no-context-files --no-skills --no-extensions --no-prompt-templates --no-session`, `claude -p --system-prompt ... --disallowedTools '*'`, `codex exec --sandbox read-only --skip-git-repo-check`, `opencode run --format json`.

**Provider resolution.** `resolveFamily` maps a provider id to its family: the id itself (`pi`, `codex`) or a segment (`pi-peer` → `pi`, `codex-lead` → `codex`, `claude-review` → `claude`, `opencode-peer` → `opencode`), longest family id first. Settings gain `providerCli: Record<string, CliFamilyId>`, editable in the settings screen under `Provider CLI`, for a profile whose id does not name its CLI (for example `compat-peer`, which runs `opencode` through a wrapper). Resolution never guesses: an unmapped, unresolvable provider returns the new `unsupported_provider` error and no process is started.

**New failure modes.** Two error codes join the rewrite RPC: `unsupported_provider` (no CLI family resolves for the provider) and `spawn_failed` (the CLI could not start). Existing codes are unchanged, and every failure still leaves the Composer text untouched. A timeout kills the whole process group, not only the direct child, so a CLI that spawns its own server cannot keep a run alive.

**Evidence source.** Gate `artifacts/gates/c033eaf6e44d306ead1a22b260026ae1c424e7a0.log` REAL_EXIT:0 (16 files, 167 passed / 9 skipped); `npx tsc --noEmit` REAL_EXIT:0. Live CLI probe `scripts/probe-cli.ts` against installed CLIs — all four OK, all preserving `/Volumes/DataSSD/app/login.ts` and `npm run gate`: `pi` (deepseek-v4.1-flash) 2.3s, `opencode` (deepseek-v4.1-flash) 5.5s, `codex` (gpt-5.6-luna) 31.0s, `claude` (claude-haiku-4-5) 12.1s. Live daemon probe `scripts/probe-daemon.ts` through the installed plugin's `prompt-kit.rewrite` RPC: `pi-peer` 2.1s, `codex` 26.0s, `claude` 4.9s, `claude-review` 3.4s, each preserving both literals; `paseo ls` counted 53 agents before and 53 after, so no agent is created; the primary agent stayed `idle` and received no turn. Plugin reloaded on the daemon: `paseo plugin reload prompt-kit` → `running`, log shows `Plugin ready`.

**Browser evidence.** MultiZen profile `20def08f-9a62-4932-9d49-f7c5ab12c6d0` ("Bờm"), artifacts `artifacts/qa/ui-20260921T1545Z/`, report `REPORT.md`. Plugin loads with no evaluation error; the settings screen renders and the new `Provider CLI` section lists one row per available provider. Exactly one visible pill; pressing it produced `rewrite start action=coding agentId=3a262737-…` then `rewrite success provider=claude model=claude-haiku-4-5 durationMs=15384` — the **dedicated** selection, not the agent's own `codex/gpt-5.6-luna`, which proves the dedicated path reaches a CLI. The Composer text was replaced (61 → 92 chars) and focus kept. **No Paseo agent was created**: `paseo ls` = 53 before and after, and the newest agent carrying the `prompt-kit: rewrite` label predates the run by two hours (`13:45:29Z` vs `15:45:54Z`). The primary conversation gained no turn (`fetchAgentTimeline` = the pre-existing 2 entries, none containing the rewritten text). Empty Composer performed no generation (log line count unchanged). An edit during the request was kept (` [EDITED-BY-HUMAN]`), so the stale-text refusal still holds. Reload left exactly one pill and one active Composer. **Not covered:** wall-clock improvement (the two runs took 15.4s and 76.2s, so a speed win is not demonstrated — `claude -p` startup dominates), the `codex`/`opencode` families through the UI, the `unsupported_provider` row, and the agent-switch row. Screenshots were captured but not visually inspected: the session's model cannot read images, so every row is asserted from the DOM and from `paseo plugin logs`, never from a PNG.

**Not yet evidenced.** A packet is still owed before any release, and `unsupported_provider` has no UI row (unit tests only).

**Reversal condition.** A Paseo release exposes a one-shot generation RPC, or lets a plugin set `internal: true` through `AgentSessionConfigSchema`, making a plugin-owned CLI spawn unnecessary → new DLF. A CLI family changes its JSON output shape and the probe cannot be repaired by adjusting one parser → new DLF.

**Supersedes / superseded by.** Amends DLF-003 (the settings snapshot still travels in the RPC; the `agents.create` path it describes is gone), DLF-006 (validator, injection boundary and timeout semantics unchanged; the temporary-agent archive clause no longer applies), DLF-007 (busy re-entry, stale-text and fail-closed refusals unchanged; the runner's transport changed). `docs/IMPELEMENT_PLAN.md` §15 ("Temporary Agent Rewrite Backend") is superseded and remains an untracked local research document.

### DLF-013 — HUMAN_DIRECTIVE: a probe uses a cheap model

- Decided at: 2026-09-21
- Decision owner: Human (directive), recorded by Lead
- Packet ID / AIT issue ID: none — a standing constraint, not a packet
- Commit SHA at decision: working tree `c033eaf6e44d306ead1a22b260026ae1c424e7a0`

**Production behavior.** A live probe or smoke test uses a cheap model. Spending a frontier call to check that argv is correct, that a JSONL line parses, or that a temporary directory is removed tests nothing a cheap model does not also test. `scripts/probe-cli.ts` lists `claude-haiku-4-5`, `gpt-5.6-luna` and `deepseek-v4.1-flash`. The directive binds the probe only: the plugin runs whatever model the user selected, and no model restriction exists in `server/` or `shared/`.

**Evidence source.** Human directive, 2026-09-21, after the DLF-012 probe ran `claude-fable-5-1` and `claude-sonnet-5` instead of the specified `claude-haiku-4-5`. The violation is recorded rather than hidden: both `scripts/probe-cli.ts` and `scripts/probe-daemon.ts` spent frontier calls before this entry. A model allowlist was briefly added to the probe and removed on the Human's correction that the runtime accepts any model; the constraint is recorded here instead of enforced in code.

**Reversal condition.** Human withdraws the directive.

**Supersedes / superseded by.** NONE

### DLF-014 — The two rewrite paths separated: the Composer's own model, or a dedicated model, both through the provider's CLI

- Decided at: 2026-09-21
- Decision owner: Lead, on a Human instruction ("tách thành các đường riêng: 1. lấy model đang hiển thị ở mục chat, 2. thiết lập model chỉ định")
- Packet ID / AIT issue ID: none yet — amends DLF-012 on the main checkout; the packet DLF-012 owes covers this too
- Commit SHA at decision: 7f9b939 (tree `9347cd7ceb8bb776297202fe244f062879647d5c`) on `main`, parent 0926ea2; committed by the Human, not pushed

**Production behavior.** The two rewrite paths DLF-012 left in one function are now separate in what they read, and the current-model path reads the same field the host's own model control reads. `server/rewrite.ts` keeps `resolveCurrentAgent` and `resolveDedicatedModel` as the two resolvers; `settings.modelMode` (`current` | `dedicated`) selects one, and only one, per request. Neither path falls through to the other.

**Current path reads the Composer's model.** Paseo resolves the model its Composer control displays from `runtimeInfo.model` first and only then from the configured model (`packages/app/src/composer/agent-controls/utils.ts`, `resolvePreferredModelId`: `runtimeSelectedModel?.id ?? normalizedConfiguredModelId ?? normalizedRuntimeModelId`). `resolveCurrentAgent` now does the same: `runtimeInfo.model`, else `agent.model`, with an empty or whitespace-only runtime value treated as absent. `runtimeInfo.model` is what the provider's own session reports (`agent-manager.ts` `refreshRuntimeInfo` → `session.getRuntimeInfo()`), so it is the value that can differ from `config.model` when a CLI picks its own default or switches model mid-session. Reading `agent.model` alone would run a model the user is not looking at, or refuse a rewrite for an agent whose Composer visibly shows one. The thinking option was already correct and is unchanged: `effectiveThinkingOptionId ?? thinkingOptionId`, which is exactly the host's `resolveEffectiveThinkingOptionId`.

**Dedicated path.** Unchanged from DLF-012: `dedicatedProvider`/`dedicatedModel`/`dedicatedThinkingOptionId` are validated against the daemon's own catalog (provider available → model listed → thinking option listed) and run through that provider's CLI, whatever CLI the primary agent uses. A selection that fails any check returns `invalid_model` and starts no process.

**The daemon's 30s ceiling, measured — and it reaches the gate.** `@getpaseo/server` rejects any `plugin.rpc.invoke` after `REQUEST_TIMEOUT_MS = 30_000` (`plugins/runtime.ts`, read out of the installed Paseo 0.8.0 `app.asar`). Both the UI pill and the RPC probe travel that path, so a rewrite that outlives 30s fails in the host with `Plugin RPC timed out` before the plugin's own `timeoutMs` (default 90_000, max 600_000) can fire. Cold runs measured on this machine: `pi` 2.8s, `claude` 6.9s, `opencode` 36.3s, `codex` 41.4s. The CLI runner still kills the process tree at its own timeout, so nothing is leaked; only the reported failure is the wrong one. This is not theoretical: the `claude/claude-haiku-4-5` row passed warm at 12.4s and then **failed at 30008ms** on the very next cold run of the same tree, which made the gate non-reproducible. The live rows are therefore opt-in — `PASEO_LIVE=1` plus `PASEO_AGENT_ID` — and a plain `npm run gate` skips them instead of spending calls and racing the cap. Recorded as DEF-008.

**Evidence source.** Gate `artifacts/gates/9347cd7ceb8bb776297202fe244f062879647d5c.log` REAL_EXIT:0 — 16 files, **170 passed / 13 skipped in 1.95s**, deterministic because the live rows are opt-in. Live two-path run `artifacts/qa/live-two-paths-20260921T1710Z.log`, primary agent `5ac80125-…` (`pi/workbuddy/deepseek-v4.1-flash`, cwd `~/Developer/zTESTING/test-model`), 13 passed, re-run green after the opt-in change: current path reported `provider=pi model=workbuddy/deepseek-v4.1-flash` (the agent's own model) at 2.0s; dedicated rows resolved one cheap model per family — `claude/claude-haiku-4-5` 12.4s, `codex/gpt-5.6-luna` 8.3s, `pi/workbuddy/deepseek-v4.1-flash` 2.9s, `opencode/workbuddy/deepseek-v4.1-flash` 3.8s. Every row asserted the agent set is unchanged across the call (`agentsBefore=136 agentsAfter=136`, plus no agent created in the workspace since the row started, plus no `prompt-kit: rewrite` label gained) and that the primary timeline gained no turn — the DLF-012 claim, now asserted by the tests instead of by a report. Failure rows: `invalid_model` (`pi-peer/model-that-does-not-exist-9f31`), `unsupported_provider` (`grok`), `timeout` at a 1s budget, each with no agent created. Language and protected-literal rows unchanged. Unit evidence for the current path: `tests/unit/rewrite.test.ts` gains three cases — the runtime model wins over the configured one and reaches argv, the runtime model is used when no configured model exists, and an empty runtime string falls back to the configured model. `npx tsc --noEmit` REAL_EXIT:0.

**Probe budget.** Every live row spends a cheap model only (`claude-haiku-4-5`, `gpt-5.6-luna`, `workbuddy/deepseek-v4.1-flash`), per DLF-013. The list is a probe budget, not a runtime allowlist: `server/` and `shared/` still accept whatever model the user selected, and a family whose cheap model the catalog cannot confirm is skipped rather than substituted.

**Not yet evidenced.** The `unsupported_provider` and `invalid_model` rows have no UI evidence (RPC only). No wall-clock comparison against the deleted temporary-agent transport. The `codex` and `opencode` families cannot complete a row on a cold CLI at all, and `claude` is borderline, because of the 30s cap (DEF-008). A packet is still owed.

**Reversal condition.** Paseo's model control stops preferring `runtimeInfo.model`, or `AgentRuntimeInfo.model` is removed → the current path reads the configured model again. Upstream raises `REQUEST_TIMEOUT_MS` for `plugin.rpc.invoke`, or the rewrite stops being a single RPC → DEF-008 changes shape.

**Supersedes / superseded by.** Amends DLF-012 (the transport, the families, the resolver split and the fail-closed rules are unchanged; the current path's model source and the live-test shape change).

### DLF-015 — A third rewrite path: direct API transport over three protocols

- Decided at: 2026-09-22
- Decision owner: Human (product directive), implemented by Lead
- Packet ID / AIT issue ID: `paseo-prompt-kit-api-transport` (docs/exec-plans/active/) — no AIT issue opened
- Commit SHA at decision: working tree `9155cc2606f032cce644f0b92131429ec43f022e` on `main`, parent `7f9b939`; not committed, not pushed

**Production behavior.** A rewrite can now reach a model over HTTP instead of a CLI. The routing is two independent axes rather than one enum, because the two questions are different: `modelMode` (`current` | `dedicated`) answers *which model*, and the new `transport` (`cli` | `api`) answers *how it is reached*. That yields three paths: `cli + current` (the model the Composer shows, run by the agent's own CLI), `cli + dedicated` (a chosen provider/model, run by that provider's CLI), and `api + either` (a configured endpoint). `current + api` is refused unless an endpoint is mapped to the agent's provider, because in that case there is no model to borrow.

**Three protocols, not N vendors.** `shared/api-protocol.ts` defines `openai` | `anthropic` | `gemini`; `server/api/{openai,anthropic,gemini}.ts` implement one protocol each behind a single `ApiProtocol` interface (`buildRequest` + `parseResponse`). Adding a vendor is a `baseUrl` in settings, not a code change — Groq, OpenRouter, LiteLLM, vLLM, llama.cpp, LM Studio, Together and Fireworks are all the `openai` entry. `server/api/runner.ts` owns key resolution, the HTTP call, the timeout and the failure mapping; `server/api/key.ts` owns where a key comes from.

**No token limit is sent on the OpenAI protocol.** OpenAI's newer models require `max_completion_tokens` and reject `max_tokens`, while older compatible endpoints understand only `max_tokens`. Omitting the field is the one body every endpoint accepts, and a rewrite is short enough not to need it. The Anthropic protocol must send `max_tokens` and does.

**Keys never enter the settings document.** A settings document is read by the client, including the Paseo Web UI, so a key stored there would leave the machine. An endpoint stores `apiKeyEnv` — the *name* of a variable — and `server/api/key.ts` resolves the value at request time from (1) that environment variable, then (2) `<secretsFile>/secrets.json`, mode 0600, then fails closed with `missing_api_key`. `secretsFile` defaults to `<PASEO_HOME>/plugin-settings/prompt-kit` and is overridable. The second source is required because Paseo.app launched from Finder inherits no shell environment, so a key exported in `.zshrc` never reaches the daemon. A failure message names the variable and never a value; the value is not logged, not returned by any RPC, and not written to disk by the plugin.

**Endpoints live in the plugin's own settings.** Verified constraint: `ProviderSnapshotEntry` (`packages/protocol/src/agent-types.ts:116-127`) carries no `env`, and the daemon passes a plugin child only `settingsDirectory` (`plugin-process-protocol.ts:24`). A provider profile in `~/.paseo/config.json` is therefore invisible to a plugin, and the plugin settings document is the only readable store. This is why no new config file was introduced.

**New failure codes.** `missing_api_key`, `api_endpoint_unknown`, `api_http_error`, `api_bad_response`, plus the existing `timeout`. Every one leaves the Composer text untouched, and none falls back to another endpoint, another model, or the CLI path. The protected-literal validator runs on the API output exactly as it does on CLI output, so the new path is not a way around the guardrail.

**Hard cut, per AGENTS.md.** `promptKitSettingsSchema` was edited in place at `version: 1`; there is no `migrate`, no dual-read, no version branch and no shim. A document written before this change parses to defaults, which is the stated policy rather than an incident.

**Evidence source.** Gate `artifacts/gates/9155cc2606f032cce644f0b92131429ec43f022e.log` REAL_EXIT:0 — 19 files, 214 passed / 20 skipped, 1.2s. Unit: `tests/unit/api-protocols.test.ts` (20 cases: request shape per protocol, no token limit on openai, trailing-slash handling, Gemini model encoding, response parsing including thinking-block filtering, key resolution order and every failure reason), `tests/unit/api-selection.test.ts` (13 cases: the client pre-flight rules for both transports), and `tests/unit/rewrite.test.ts` grows 13 API-path cases (no CLI spawned, provider mapping sends the agent's model, a provider with no CLI family works, `missing_api_key` names the variable and makes no request, non-2xx, unreadable body, endpoint unknown, `current + api` refused, undeclared model refused, protected-literal loss refused, timeout, no CLI family required). Live: `scripts/probe-api.ts` ran the real path against Google — `gemini` `gemini-2.5-flash` 2.7s, both literals kept (`artifacts/qa/probe-api-20260921T1735Z.log`). The Groq `openai` body was accepted by `api.groq.com` (HTTP 401 on an invalid key, i.e. the request shape parsed) — no Groq key was available for a full round trip. Live through the daemon: `tests/integration/live-api.test.ts` 5 passed / 2 skipped, exercising the real `secrets.json` read, a real rewrite, the missing-key row, the unknown-endpoint row, and an unchanged agent set. The two CLI paths were re-verified unchanged in the same session: `tests/integration/live-daemon.test.ts` 13 passed.

**Not yet evidenced.** No Groq or Anthropic round trip: neither key was present, so those two protocols are proven by unit tests and by the accepted request shape, not by a live answer. No browser row for the new settings section. No UI evidence for the API failure codes.

**Reversal condition.** Paseo exposes provider environment variables to plugins, or a plugin-readable config path, making the settings-document endpoint list unnecessary → new DLF. A protocol changes its request or response shape in a way one parser cannot absorb → new DLF.

**Supersedes / superseded by.** Amends DLF-014 (paths 1 and 2 are unchanged; a third is added and the two axes are named). Related: DEF-008 (the 30s daemon cap still applies — the API path is fast enough to stay under it in the common case, but a slow endpoint is still capped by the host).
