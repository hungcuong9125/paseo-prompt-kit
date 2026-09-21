# Project Memory

Current-state takeover index. History → `docs/exec-plans/`; decisions → `docs/decision-log.md`.

- Framework revision: bundle delivered 2026-09-21 (protocol v1)
- Updated at: 2026-09-21 04:05Z
- Active Lead: claude-lead / claude-fable-5-1 (Lead-of-record, idle after release-prep closeout)
- Repository HEAD: see `git log -1`; branch `main`; origin https://github.com/hungcuong9125/paseo-prompt-kit — public main f07b0c6, tag v0.1.0 → 94e9a9a (release evidence commit below is local until the next push)
- AIT database: initialized (prefix `pk`, `.ait/ait.db`, ignored)
- AIT graph snapshot: epics pk-UkLWZ and pk-OIJLh CLOSED
- AIT open: 0 — reconciled 2026-09-21
- Active AIT issue IDs: none
- Handoff type: NONE
- Active Peer disposition: none (f57a7628 archived after handback)
- Heartbeat ID: none (9e0e898c deleted at closeout)
- Deferred: 4 open — docs/DEFERRED.md (DEF-001, DEF-002, DEF-006, DEF-007)

## Batch paseo-prompt-kit-release-0.1.0 — ACCEPTED, PUBLIC (Human pushed 2026-09-21)

- Packet: docs/exec-plans/done/paseo-prompt-kit-release-0.1.0.md · DLF-009..011.
- Release candidate 94e9a9a3c70f9a68a71017dca80739e221a122b7 (tree 94cfc8f30cb72e9a4d81381e1f33583e16d88c00); local annotated tag v0.1.0 → 94e9a9a. Gate artifacts/gates/94cfc8f3….log REAL_EXIT:0 (119 tests).
- Host-load defect DLF-010 fixed (index.client.tsx default export declared); browser QA PASS with MultiZen (artifacts/qa/ui-20260921T095604Z/); repro kept in artifacts/qa/ui-20260921T092855Z/.
- origin/main = f07b0c63cc87190b60bfdce16b577aac5381f7db; refs/tags/v0.1.0^{} = 94e9a9a3c70f9a68a71017dca80739e221a122b7 (Human-run push, verified by `git ls-remote`). npm deferred.
- Daemon: prompt-kit running from the DIRECTORY install (/Volumes/DataSSD/HomeWork/PLUGIN/paseo-prompt-kit); a Git install is now valid: `paseo plugin install hungcuong9125/paseo-prompt-kit --ref v0.1.0` (not yet run; optional bounded ops task).
- MultiZen profile 20def08f-… was left running (visible window); theme `auto` untouched.

## Batch paseo-prompt-kit-mvp — ACCEPTED

- Packet: docs/exec-plans/done/paseo-prompt-kit-mvp.md · intent docs/intents/paseo-prompt-kit-mvp.md · Report to bf776d78-0b8a-44d3-9336-72a79e280ad7
- Accepted commits on main: 76992b4 (.1 skeleton+contracts), f7e27ed (.3 server), 32c77c0 (.2 client), ef88e5e + 1005d68 (README), 71b1b5f (F2 server types). Gate: artifacts/gates/9fd26b0499f096c4933786124ead0a825756fc53.log REAL_EXIT:0 (118 tests, live-daemon ran).
- Daemon state: plugin `prompt-kit` installed from Git (`--ref main` → 71b1b5f) and running; switch back to directory install with `paseo plugin install /Volumes/DataSSD/HomeWork/PLUGIN/paseo-prompt-kit`.
- Target Paseo 0.8.0 (installed); upstream clone is 0.9.0-beta.2 — installed packages win (DLF-003).
- Human decisions received post-closeout (DLF-009): license MIT, tag v0.1.0, npm deferred — NOT executed yet; they form the next bounded release batch (LICENSE + package.json license + tag v0.1.0 + push). Lead cannot push/tag from its seat: the release Peer does. MultiZen MCP is available in the Lead runtime and, per HUMAN_DIRECTIVE 2026-09-21, on pi-peer seats (Deepseek) via npm:pi-mcp-adapter with bearer auth from the seat env (tools `multizen-mcp_*`: list_tabs, evaluate_js, get_cookies, …). Browser QA batch, when assigned, routes to `pi-peer/workbuddy/deepseek-v4.1-flash` and the dispatch must open with a capability check (list MultiZen tools; BLOCKED if absent) and never carry a token. Profile 20def08f-9a62-4932-9d49-f7c5ab12c6d0 (Bờm), isRunning=false at last report.
- Browser QA: BLOCKED — no seat has MultiZen MCP (DEF-003).

## Upstream research pins (local only, never committed)

- upstreams/paseo d636abd7a4ce302e7ccb9eb6074f637c6dd4d83b · paseo-emoji 425e37563234d05a3ceaf15040db221625537db9 · aidrin e70248c34c7588a97a07830ff2652d4e35ce5fe4 · nativeprompt 45c2948da6beeb6c2f3e239a8457d4a6d36e64fb · prompt-optimizer 5d47a19aa53e6976b7f288d3ec4a6f1e2a1ed197

## Lessons (this batch)

- `git worktree` and `git push` are denied on the Lead seat: worktrees via Paseo `create_workspace`, pushes via a Peer that holds the main checkout.
- pi-peer at `low` thinking can degenerate into a prose loop with no tool calls after a mid-task re-prompt (seat 49d1e9f6); replacement at `high` finished cleanly.
- The managed Git checkout has no `node_modules`: server code may import only host SDK specifiers (`@getpaseo/plugin*`); type-only imports from `@getpaseo/client` break `paseo plugin install <git>` (F2).
- Browser QA capability arrived after closeout: pi-peer + MultiZen MCP (Human-configured); Claude/Codex peers still lack it. Real-host QA then exposed DLF-010: jsdom/source evidence for UI acceptance is not a substitute for the host — a load-path test (bundle + host interop) now guards it.
- Mid-task re-prompts interrupt the active Pi turn; expect an 'interrupted' event and a fresh turn, not a lost seat.

## Takeover instructions

- Immediate next action: none. Optional bounded ops task on request: verify `paseo plugin install hungcuong9125/paseo-prompt-kit --ref v0.1.0`. Next brief starts a new packet; re-read WORKSPACE_PROTOCOL.md, framework/protocol.md, framework/provider-routing.md, this file.
