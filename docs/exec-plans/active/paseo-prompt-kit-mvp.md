# PromptKit MVP — Desktop/Web Improve coding prompt

Packet ID: paseo-prompt-kit-mvp · AIT epic: pk-UkLWZ · Intent: docs/intents/paseo-prompt-kit-mvp.md

## Outcome And Constraints

Installable PromptKit plugin (`prompt-kit`) that rewrites the Composer prompt via a temporary Paseo agent and replaces the Composer text without sending. Acceptance checks, invariants, non-goals: the intent brief. Local research (`docs/IMPELEMENT_PLAN.md`, `upstreams/`) never committed.

## Context And Ownership

- Plan: `docs/IMPELEMENT_PLAN.md` (local). Upstream pins: MEMORY.md.
- Plugin runtime split: `index.client.tsx` + `client/` (app), `index.server.ts` + `server/` (daemon), `shared/` (contracts). Client↔server only via `defineRpc`.
- Composer text has no public API; DOM adapter isolated in one client module (pattern: `upstreams/paseo-emoji/client/web.ts`).

## Direction And Work Units

| AIT | Scope | Write scope | Depends |
|---|---|---|---|
| pk-UkLWZ.1 | scaffold, shared contracts, gate script, composer + temp-agent spikes, min Paseo version evidence | whole repo (first writer) | — |
| pk-UkLWZ.2 | Composer adapter, button/menu, busy/stale/empty/failure handling, settings screen + model picker | `client/**`, `index.client.tsx`, client tests | .1 |
| pk-UkLWZ.3 | temp-agent backend, model resolution, coding action engine, protected literals, injection boundary, output validator, safe logging | `server/**`, `index.server.ts`, server tests | .1 |
| pk-UkLWZ.4 | integration on main, QA matrix Desktop/Web (MultiZen profile 20def08f-9a62-4932-9d49-f7c5ab12c6d0 when MCP available), ultimate_bug_scanner pass (DLF-004), reload, full gate, install local + Git, README/LICENSE/version | integration + release files | .2, .3 |

Frozen after .1 acceptance: `shared/**`, `package.json`, `paseo-plugin.json`, `tsconfig.json`, `vitest.config.ts`. Changes go through DEPENDENCY_REQUEST.

## Acceptance And Recovery

Each task hands back base/candidate SHA, commands + results, tests that fail if the claimed behavior vanished. Full gate once, on the landing tree, by .4, log at `artifacts/gates/<tree>.log`. Push to origin by Lead at acceptance only. Rollback: revert acceptance commit; plugin uninstall via `paseo plugin remove prompt-kit`.

## Task cards

### pk-UkLWZ.1 — ACCEPTED 76992b4070ed38c76befd9d18a623c3f907b78d7 (tree 0de83b0e2bab3b15e455951a43ce2b883ccf8f1a), gate log artifacts/gates/0de83b0e2bab3b15e455951a43ce2b883ccf8f1a.log, DLF-003


### pk-UkLWZ.1
```yaml
task: pk-UkLWZ.1 scaffold+spike
outcome: typechecking plugin skeleton installed locally; shared contracts frozen; two spikes proven; gate script exists
owner: (set at dispatch)
depends_on: [DLF-001, DLF-002]
change_boundary: repo root (first writer), excluding docs/IMPELEMENT_PLAN.md, upstreams/, framework/, governance files
invariants: [no auto-send, no rewrite turn in primary conversation, temp agent archived in finally, no raw prompt logging by default]
acceptance: [npm run typecheck green, npm run gate green, paseo plugin install <checkout> lists prompt-kit, spike evidence for composer replace and temp-agent round-trip]
reopen_when: [Composer DOM root not locatable on target Paseo version, SDK cannot create+archive a temp agent with systemPrompt]
```
