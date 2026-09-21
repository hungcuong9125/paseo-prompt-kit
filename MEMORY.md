# Project Memory

Current-state takeover index. History → `docs/exec-plans/`; decisions → `docs/decision-log.md`.

- Framework revision: bundle delivered 2026-09-21 (protocol v1)
- Updated at: 2026-09-21 04:05Z
- Active Lead: claude-lead / claude-fable-5-1 (Lead-of-record, idle after closeout)
- Repository HEAD: see `git log -1`; branch `main`; origin https://github.com/hungcuong9125/paseo-prompt-kit — landing code 71b1b5f81b1e2c2f37422665267a75dc4f4d92c0 pushed
- AIT database: initialized (prefix `pk`, `.ait/ait.db`, ignored)
- AIT graph snapshot: epic pk-UkLWZ CLOSED (.1–.4 closed)
- AIT open: 0 — reconciled 2026-09-21
- Active AIT issue IDs: none
- Handoff type: NONE
- Active Peer disposition: none (all Peers archived)
- Heartbeat ID: none (cf4d76e8 deleted at closeout)
- Deferred: 3 open — docs/DEFERRED.md (DEF-004/005 TAKEN_UP by DLF-009)

## Batch paseo-prompt-kit-mvp — ACCEPTED

- Packet: docs/exec-plans/done/paseo-prompt-kit-mvp.md · intent docs/intents/paseo-prompt-kit-mvp.md · Report to bf776d78-0b8a-44d3-9336-72a79e280ad7
- Accepted commits on main: 76992b4 (.1 skeleton+contracts), f7e27ed (.3 server), 32c77c0 (.2 client), ef88e5e + 1005d68 (README), 71b1b5f (F2 server types). Gate: artifacts/gates/9fd26b0499f096c4933786124ead0a825756fc53.log REAL_EXIT:0 (118 tests, live-daemon ran).
- Daemon state: plugin `prompt-kit` installed from Git (`--ref main` → 71b1b5f) and running; switch back to directory install with `paseo plugin install /Volumes/DataSSD/HomeWork/PLUGIN/paseo-prompt-kit`.
- Target Paseo 0.8.0 (installed); upstream clone is 0.9.0-beta.2 — installed packages win (DLF-003).
- Human decisions received post-closeout (DLF-009): license MIT, tag v0.1.0, npm deferred — NOT executed yet; they form the next bounded release batch (LICENSE + package.json license + tag v0.1.0 + push). Lead cannot push/tag from its seat: the release Peer does. MultiZen MCP is now available in the Lead runtime (profile 20def08f-9a62-4932-9d49-f7c5ab12c6d0, isRunning=false) — browser QA only in a new batch on the Human's instruction.
- Browser QA: BLOCKED — no seat has MultiZen MCP (DEF-003).

## Upstream research pins (local only, never committed)

- upstreams/paseo d636abd7a4ce302e7ccb9eb6074f637c6dd4d83b · paseo-emoji 425e37563234d05a3ceaf15040db221625537db9 · aidrin e70248c34c7588a97a07830ff2652d4e35ce5fe4 · nativeprompt 45c2948da6beeb6c2f3e239a8457d4a6d36e64fb · prompt-optimizer 5d47a19aa53e6976b7f288d3ec4a6f1e2a1ed197

## Lessons (this batch)

- `git worktree` and `git push` are denied on the Lead seat: worktrees via Paseo `create_workspace`, pushes via a Peer that holds the main checkout.
- pi-peer at `low` thinking can degenerate into a prose loop with no tool calls after a mid-task re-prompt (seat 49d1e9f6); replacement at `high` finished cleanly.
- The managed Git checkout has no `node_modules`: server code may import only host SDK specifiers (`@getpaseo/plugin*`); type-only imports from `@getpaseo/client` break `paseo plugin install <git>` (F2).
- No seat in the room has an MCP browser client; browser QA needs a Human-provided seat.

## Takeover instructions

- Immediate next action: on the Human's go, open batch `paseo-prompt-kit-release-0.1.0` (LICENSE MIT, package.json license, tag v0.1.0, push; optional browser QA rows from DEF-003). Local HEAD carries one unpushed evidence commit (DLF-009) — push it with the release batch. Next brief starts a new packet; re-read WORKSPACE_PROTOCOL.md, framework/protocol.md, framework/provider-routing.md, this file.
