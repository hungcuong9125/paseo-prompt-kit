# Project Memory

Current-state takeover index. History → `docs/exec-plans/`; decisions → `docs/decision-log.md`.

- Framework revision: bundle delivered 2026-09-21 (protocol v1)
- Updated at: 2026-09-21
- Active Lead: claude-lead / claude-fable-5-1 (Lead-of-record)
- Repository HEAD: see `git log -1`; branch `main`; origin https://github.com/hungcuong9125/paseo-prompt-kit (empty remote, nothing pushed)
- AIT database: initialized (prefix `pk`, `.ait/ait.db`, ignored)
- AIT graph snapshot: epic pk-UkLWZ → .1 scaffold+spike, .2 client, .3 server, .4 qa+release; .2/.3 blocked by .1; .4 blocked by .2/.3
- AIT open: 4 (epics 1, tasks 3) — reconciled 2026-09-21
- Active AIT issue IDs: pk-UkLWZ.1 — dispatched to Peer f5e1d938-a6a9-4c9b-9795-9ce1e1ba22af (pi-peer/workbuddy/deepseek-v4.1-flash high), base 3a2cba63e7b8b2eec6bbcde24874f4b176e0ca42
- Handoff type: NONE
- Active Peer disposition: f5e1d938 (pk-UkLWZ.1) handed back, ACCEPTED, retained idle (warm context for shared/** questions)
- Heartbeat ID: cf4d76e8 (lead-pk-mvp-watch, */30 min, expires 2026-09-21T13:10Z)
- Deferred: 2 open — docs/DEFERRED.md

## Active packets

- Packet: docs/exec-plans/active/paseo-prompt-kit-mvp.md · intent docs/intents/paseo-prompt-kit-mvp.md · Report to bf776d78-0b8a-44d3-9336-72a79e280ad7
- State: pk-UkLWZ.1 ACCEPTED 76992b4070ed38c76befd9d18a623c3f907b78d7 (tree 0de83b0e2bab3b15e455951a43ce2b883ccf8f1a; DLF-003). Human directive DLF-004 (bug scanner + MultiZen) bound to .4. Next: .2 and .3 in worktrees.
- Route: implement on `pi-peer/workbuddy/deepseek-v4.1-flash` (brief lock); catalog confirms thinking ids low/high/max; Pi has no modeId.
- Open questions upward (not yet material): npm scope/publish; release tag; min Paseo version (bind from `paseo plugin init` output in .1).

## Upstream research pins (local only, never committed)

- upstreams/paseo            d636abd7a4ce302e7ccb9eb6074f637c6dd4d83b (v0.9.0-beta.2, depth 1)
- upstreams/paseo-emoji      425e37563234d05a3ceaf15040db221625537db9 (pinned per plan §7)
- upstreams/aidrin           e70248c34c7588a97a07830ff2652d4e35ce5fe4
- upstreams/nativeprompt     45c2948da6beeb6c2f3e239a8457d4a6d36e64fb
- upstreams/prompt-optimizer 5d47a19aa53e6976b7f288d3ec4a6f1e2a1ed197
- Clone log: .logs/upstream-clone.log (REAL_EXIT:0)

## Plan assumptions verified against upstreams/paseo (2026-09-21)

- `addComposerPill`, `addSettingsScreen`: packages/plugin/src/client/contracts.ts:88,95; button kinds action/menu/popover: client/buttons.ts:15-18.
- Server: `registerSettings`, `handle(contract, handler, {paseo: PaseoApi})`: packages/plugin/src/server/contracts.ts. `defineSettings`/`defineRpc`: packages/plugin/src/index.ts:14,22.
- SDK create agent: `systemPrompt`, `autoArchive` (packages/client/src/index.ts:238,259); `waitForFinish` on client.
- CLI: `paseo plugin init <dir> [--id]`, `install|add <source> [--ref]`, `ls`, `logs`, `update`, `remove` (packages/cli/src/commands/plugin/index.ts:197-250).
- Composer DOM: `[data-testid="message-input-root"]` (emoji client/web.ts:61; still in packages/app/src/composer/input/input.tsx); inner field testID `composer-input`; write via native value setter + `input` event.
- Local `paseo` CLI denied on Lead seat; `semble` absent (grep fallback). `dcg`, `ait`, `gh`, node v22.23.1, npm 10.9.8 present.

## Writable ownership

- Scope: frozen at 76992b40: `shared/**`, `package.json`, `paseo-plugin.json`, `tsconfig.json`, `vitest.config.ts`.

## Takeover instructions

- Immediate next action: read F1 correction commit from f5e1d938; confirm with the prose probe (`make the login page work again` etc. must yield no literal); squash 78a700c+5c60258+correction into one acceptance commit; then create worktrees `.worktrees/client` (.2) and `.worktrees/server` (.3) from the acceptance SHA and dispatch both on pi-peer/workbuddy/deepseek-v4.1-flash low.
- Preflight: re-read WORKSPACE_PROTOCOL.md, framework/protocol.md, framework/provider-routing.md, this file, packet; `ait status`; `git status`.
