# PromptKit release 0.1.0 preparation and browser QA

**State: ACCEPTED (2026-09-21).** RC 94e9a9a3c70f9a68a71017dca80739e221a122b7, local tag v0.1.0, gate artifacts/gates/94cfc8f30cb72e9a4d81381e1f33583e16d88c00.log REAL_EXIT:0; DLF-010 (host-load defect) and DLF-011 (acceptance). Push of main and v0.1.0 is the Human's action; until reported, the release is locally prepared only. Open: DEF-006, DEF-007.

Packet ID: paseo-prompt-kit-release-0.1.0 · AIT epic: pk-OIJLh · Intent: docs/intents/paseo-prompt-kit-release-0.1.0.md · Base: main @ 09e1d89 (accepted code tree 9fd26b0499f096c4933786124ead0a825756fc53 unchanged since 71b1b5f)

## Outcome And Constraints

Release-ready local state: MIT LICENSE + package metadata, local tag v0.1.0 on the release candidate, real MultiZen browser QA evidence for the DEF-003 rows, exact push commands for the Human. No push, no tag push, no npm publish by any agent. Tokens never in repo/prompts/logs.

## Direction And Work Units

| AIT | Scope | Write scope | Route | Depends |
|---|---|---|---|---|
| pk-OIJLh.1 | LICENSE (MIT), package.json license field, README license + attribution line | LICENSE, package.json (license field only), README.md | Lead labeled commit (docs-only mechanical, deterministic) | — |
| pk-OIJLh.2 | Browser QA rows: one pill/menu, reload no duplicates, agent switching, edit-during-request, theme/readability; PASS/BLOCKED/UNKNOWN with tool evidence | artifacts/qa/** only | pi-peer/workbuddy/deepseek-v4.1-flash high + MultiZen MCP | — |

Then Lead: fold, `git tag v0.1.0 <rc>`, closeout evidence commit, ACCEPTED capsule with push commands.

## Acceptance And Recovery

Release-only files: checks = JSON parse of package.json, `npm run typecheck`, `paseo plugin reload prompt-kit` not required (manifest untouched). QA: each row cites the multizen-mcp call that produced it; artifacts under artifacts/qa/ui-*/. Rollback: delete local tag; revert the release commit.
