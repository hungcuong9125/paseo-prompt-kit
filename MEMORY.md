# Project Memory

Current-state takeover index. History → `docs/exec-plans/`; decisions → `docs/decision-log.md`.

- Framework revision: bundle delivered 2026-09-21 (protocol v1)
- Updated at: 2026-09-21
- Active Lead: claude-lead / claude-fable-5-1 (Lead-of-record)
- Repository HEAD: see `git log -1`; branch `main`; origin https://github.com/hungcuong9125/paseo-prompt-kit (empty remote, nothing pushed)
- AIT database: initialized (prefix `pk`, `.ait/ait.db`, ignored)
- AIT graph snapshot: epic pk-UkLWZ → .1 scaffold+spike, .2 client, .3 server, .4 qa+release; .2/.3 blocked by .1; .4 blocked by .2/.3
- AIT open: 5 (epics 1, tasks 4) — reconciled 2026-09-21
- Active AIT issue IDs: pk-UkLWZ.1 (next dispatch)
- Handoff type: NONE
- Active Peer disposition: none yet
- Heartbeat ID: none
- Deferred: 0 open — docs/DEFERRED.md

## Active packets

- Packet: docs/exec-plans/active/paseo-prompt-kit-mvp.md · intent docs/intents/paseo-prompt-kit-mvp.md · Report to bf776d78-0b8a-44d3-9336-72a79e280ad7
- State: packet opened; DECISION_REQUEST (framework source) answered → Option A; no writable dispatch yet.
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

- Scope: none active. Frozen after pk-UkLWZ.1: `shared/**`, `package.json`, `paseo-plugin.json`, `tsconfig.json`, `vitest.config.ts`.

## Takeover instructions

- Immediate next action: dispatch pk-UkLWZ.1 (or read its handback if a seat exists — `list_agents`).
- Preflight: re-read WORKSPACE_PROTOCOL.md, framework/protocol.md, framework/provider-routing.md, this file, packet; `ait status`; `git status`.
