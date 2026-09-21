# Workspace Protocol

Protocol version: 1. Owner: Human. Required reader: Lead before orchestration and again after
every compaction. Peers use their seat role and dispatch prompt; this file is not broadcast.

Shared law is `framework/protocol.md` and is not repeated here. This file holds only what is
true of this repository: identity, pins, the gate, and repo-local gates. Keep it under 80
lines; a rule that would apply to every project belongs upstream, not here.

## Project

- name: `paseo-prompt-kit` — PromptKit, a Paseo plugin (id `prompt-kit`) that rewrites the Composer prompt without sending it.
- criticality / dominant risks: overwriting the user's Composer text with a wrong or stale rewrite; leaking a rewrite turn into the primary conversation; raw prompts in logs; Composer DOM coupling breaking on Paseo UI updates.
- expensive-to-reverse decisions: plugin id `prompt-kit`; settings schema shape (host-scoped, persisted); RPC contract `prompt-kit.*`; npm package scope (undecided — Human).
- external side effects: `git push` to `https://github.com/hungcuong9125/paseo-prompt-kit` allowed by intent brief (Lead only, at acceptance). `paseo plugin install` into the local daemon is a required acceptance check. npm publish, release tags, and any other release commitment are forbidden without Human decision.
- forbidden paths / untouchable files: `docs/IMPELEMENT_PLAN.md` and `upstreams/` are read-only local research, never staged (`.gitignore`). `framework/`, `AGENTS.md`, this file: Lead/Human only.

## Routing pins

- Implement: `pi-peer/workbuddy/deepseek-v4.1-flash` (intent brief locked decision); thinking per `framework/provider-routing.md` (`low` → `high` → `max`).
- Provider access settings: `framework/provider-routing.md` → Access modes per provider. Pi has no modes; set `thinkingOptionId` only.
- Local `paseo` CLI is denied on the Lead seat; Peers run `paseo plugin …` and hand back verbatim output.

## Gate

- canonical entry point: `npm run gate` (defined by the scaffold task; equals `npm run typecheck && npm test` until that task lands).
- full-gate command (single seat, detached): `npm run gate`
- expected duration alone / under load: `< 3 min / < 6 min`
- gate log path: `artifacts/gates/<tree>.log` — exit code written into the log body as `REAL_EXIT:<n>`
- contention signature (re-run the package alone, not the suite): vitest `Test timed out` / `EADDRINUSE`
- cheap pre-checks every candidate runs: `npm run typecheck`, vitest for touched directories
- gates conditional on touched paths: `client/**` → jsdom composer tests; `server/**` → server integration tests

## Repo-local gates and procedures

- Desktop/Web QA: manual matrix in `docs/IMPELEMENT_PLAN.md` §22 Phase 7, run by the QA/verify seat against a local Paseo daemon with the plugin installed from this checkout; browser evidence via MultiZen MCP (profile `20def08f-9a62-4932-9d49-f7c5ab12c6d0`) on a `pi-peer` seat (Pi loads `npm:pi-mcp-adapter`; token comes from the seat env, never from repo files, briefs, or prompts), else `UNKNOWN` with the reason. Browser evidence counts only when the MCP call itself succeeded.
- Release/install check: `paseo plugin install <this checkout>` and `paseo plugin install hungcuong9125/paseo-prompt-kit --ref <sha|tag>` after the Lead pushes.
- Serial-by-nature paths (never in two concurrent write scopes): `package.json`, `package-lock.json`, `paseo-plugin.json`, `tsconfig.json`, `vitest.config.ts`, `shared/**`, `index.client.tsx`, `index.server.ts`.
- Worktrees for concurrent writers live under `.worktrees/` (ignored); AIT db is `<main>/.ait/ait.db`.

## Current coordination snapshot

- Lead-of-record: claude-lead (claude-fable-5-1), session started 2026-09-21. Open batch: `paseo-prompt-kit-mvp`.

## Evolution

- Human approves changes; review after a repeated pattern or major architecture shift.
