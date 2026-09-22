# Project Memory

Current-state takeover index. History → `docs/exec-plans/`; decisions → `docs/decision-log.md`.

- Framework revision: bundle delivered 2026-09-21 (protocol v1)
- Updated at: 2026-09-22 11:10Z
- Active Lead: claude-lead / claude-fable-5-1 (Lead-of-record) — open batch paseo-prompt-kit-post-release-composer-bug
- Repository HEAD: see `git log -1`; branch `main`; origin https://github.com/hungcuong9125/paseo-prompt-kit — public main f07b0c6, tag v0.1.0 → 94e9a9a (release evidence commit below is local until the next push)
- AIT database: initialized (prefix `pk`, `.ait/ait.db`, ignored)
- AIT graph snapshot: epics pk-UkLWZ, pk-OIJLh CLOSED; epic pk-98Fqg (composer selection bug) OPEN with task .1
- AIT open: 2 (epic pk-98Fqg, task .1) — reconciled 2026-09-21
- Active AIT issue IDs: pk-98Fqg.1 → Peer d3fa32ad-a177-4075-bd83-2c41964b3545 (pi-peer/workbuddy/deepseek-v4.1-flash high + MultiZen; investigate→implement→verify; write scope client/composer/**, client/pills/rewrite-runner.ts, agent-pills.ts, index.client.tsx wiring, tests) — dispatched 10:57Z, base 6e6a5e8 (code tree 94cfc8f3… = v0.1.0)
- Rewrite transport (DLF-012, COMMITTED as 0926ea2; superseded in part by DLF-014): the temporary-agent path is GONE. `server/generation.ts` deleted; `server/rewrite.ts` resolves a provider to a CLI family and `server/cli/{family,process,runner}.ts` spawns that CLI headlessly. No tab, no agent, no archive. New settings field `providerCli`; new error codes `unsupported_provider`, `spawn_failed`. Evidence: gate `artifacts/gates/c033eaf6e44d306ead1a22b260026ae1c424e7a0.log` REAL_EXIT:0 (167 passed / 9 skipped — the live rows skipped because `PASEO_AGENT_ID` was unset); live CLI probe all 4 families OK; live daemon RPC probe OK, `paseo ls` 53→53. Browser QA PASSED (artifacts/qa/ui-20260921T1545Z/REPORT.md, MultiZen profile 20def08f): plugin loads, 1 pill, dedicated claude/claude-haiku-4-5 rewrite replaced the Composer text with focus kept, `paseo ls` 53->53 (no agent created), primary timeline gained no turn, empty Composer did nothing, edit-during-request kept, reload -> 1 pill. NOT demonstrated: any wall-clock win (15.4s/76.2s; claude -p startup dominates).
- HUMAN_DIRECTIVE (DLF-013): a live probe or smoke test uses a cheap model. The plugin itself runs whatever model the user selected; never add a model allowlist to runtime code.
- Two-path split (DLF-014, COMMITTED as 7f9b939, tree `9347cd7c…`): the current path now reads the model the Composer shows. `resolveCurrentAgent` takes `runtimeInfo.model` first, then `agent.model` (empty string treated as absent), matching the host's own `resolvePreferredModelId`. The dedicated path is unchanged. Live test rewritten for the CLI transport: no `temporary agent`/`archivedAt` claim left; one cheap model per family (claude-haiku-4-5, gpt-5.6-luna, workbuddy/deepseek-v4.1-flash on pi and opencode); every row asserts the agent set is unchanged and the primary timeline gained no turn. The live rows are OPT-IN — `PASEO_LIVE=1 PASEO_AGENT_ID=<uuid> npx vitest run tests/integration` — because the daemon's 30s plugin-RPC cap makes them timing-dependent (DEF-008). Evidence: gate `artifacts/gates/9347cd7ceb8bb776297202fe244f062879647d5c.log` REAL_EXIT:0 (16 files, 170 passed / 13 skipped, 1.95s, deterministic); live log `artifacts/qa/live-two-paths-20260921T1710Z.log` 13 passed on agent 5ac80125-… in ~/Developer/zTESTING/test-model. Unit rows added in tests/unit/rewrite.test.ts (3).
- Third rewrite path (DLF-015, UNCOMMITTED, parent 7f9b939): routing is two axes, `modelMode` (`current`|`dedicated`) × `transport` (`cli`|`api`). New `server/api/**`: `protocol.ts` (interface), `openai.ts`/`anthropic.ts`/`gemini.ts` (one protocol each), `key.ts` (env → secrets.json → `missing_api_key`), `runner.ts` (HTTP, timeout, error mapping). `server/rewrite.ts` now has `resolveCliTarget` + `resolveApiTarget`; the API path deliberately does NOT require a CLI family, so a provider like `grok` is reachable. New settings: `transport`, `apiEndpoints`, `apiEndpointId`, `apiModel`, `apiEndpointByProvider`, `secretsFile`. New error codes: `missing_api_key`, `api_endpoint_unknown`, `api_http_error`, `api_bad_response`. Keys NEVER enter the settings document (it reaches the browser); an endpoint stores `apiKeyEnv` (a name). README has an "API keys" section. Evidence: gate `artifacts/gates/9155cc2606f032cce644f0b92131429ec43f022e.log` REAL_EXIT:0 (19 files, 214 passed / 20 skipped, 1.2s); live Gemini via `scripts/probe-api.ts` 2.7s both literals kept (`artifacts/qa/probe-api-20260921T1735Z.log`); live via daemon `tests/integration/live-api.test.ts` 5 passed / 2 skipped; CLI paths re-verified `tests/integration/live-daemon.test.ts` 13 passed. NOT evidenced: no Groq/Anthropic round trip (no keys on this machine), no browser row for the new settings section. No packet committed, no push.
- NEW FINDING (DEF-008, OPEN): the daemon hard-caps one plugin RPC at `REQUEST_TIMEOUT_MS = 30_000` (`@getpaseo/server` `plugins/runtime.ts`; verified in the installed 0.8.0 `app.asar`), while `timeoutMs` advertises up to 600_000. A rewrite longer than 30s fails in the host with `Plugin RPC timed out` before the plugin's own timeout fires. Measured cold: pi 2.8s, claude 6.9s, opencode 36.3s, codex 41.4s. It reaches the gate: the claude row passed warm at 12.4s and failed cold at 30008ms on the same tree. No process leaks (the runner still kills the tree); only the reported error is wrong. Live rows are now opt-in; the production symptom is untouched. The API transport (DLF-015) is the mitigation for the common case: one POST is 1–5s instead of a 36–41s cold start.
- Handoff type: NONE
- Active Peer disposition: d3fa32ad pk-98Fqg.1 on main (sole writer)
- Heartbeat ID: 14dc4094 (lead-pk-bugfix-watch, */30 min, expires 2026-09-21T14:56Z)
- Deferred: 5 open — docs/DEFERRED.md (DEF-001, DEF-002, DEF-006, DEF-007, DEF-008)

## Human-directed restructure 2026-09-22 (UNCOMMITTED on main)

- HUMAN_DIRECTIVE 2026-09-22: review for hidden bugs and fix; redesign the Settings screen; restructure per `docs/CORE.md`. Executed directly by the Human's seat; the G0 gate below is superseded for the *layout* part by this directive, the pack trust model (OQ-1/OQ-3) stays bundled-only as recorded in `docs/CORE.md` §7.
- Host constraint verified from source (`packages/server/src/server/plugins/compiler.ts` `directoryTarget`): only `client/`, `server/`, `shared/` are legal root dirs, so CORE modules live inside them: `shared/action-registry`, `shared/packs`, `client/composer-bridge`, `server/rewrite-engine`, `server/model-resolver`, `server/transports/{cli,api}`. `docs/CORE.md` rewritten as as-built; `docs/EXTENDING.md` + `docs/templates/` added.
- Bugs fixed: (1) dedicated CLI path required the *current* agent's provider to have a CLI family (`resolveCurrentAgent` ran first) → `unsupported_provider` from e.g. a `grok` agent; resolver now reads the agent once without a family requirement. (2) `resolveApiKey` collapsed `unreadable_secrets` into `missing_key`, so a malformed `secrets.json` told the user to add a key; reason now propagates and the message says to fix the file. (3) Settings screen shipped a debug line ("Hello Việt Nam 6"), had no UI for `apiEndpointByProvider`/`secretsFile`, showed the CLI map only in dedicated mode, and let out-of-range timeouts / invalid endpoints reach the host as schema errors; test-result write-back could overwrite concurrent edits (stale closure).
- Settings screen v2: status bar (readiness + Save/Discard, `client/settings/readiness.ts`), functional-patch draft hook (`draft.ts`), pre-save `validation.ts`, five sections under `client/settings/sections/`, three own primitives under `client/settings/ui/`. `resolveCliFamilyId` moved to `shared/cli-families.ts` so the screen shows the same family the daemon resolves. Engine select label is "Model source".
- Gate at this tree: typecheck clean; `vitest` unit+jsdom 21 files / 258 passed (host-load row ran via Paseo.app esbuild). `paseo plugin reload prompt-kit` → "Plugin ready", no `action packs rejected`. NOT evidenced: a browser/visual pass of the new screen (no MultiZen on this seat).

## Batch paseo-prompt-kit-post-release-composer-bug — OPEN

- Packet: docs/exec-plans/active/paseo-prompt-kit-post-release-composer-bug.md · intent @ 6e6a5e81c77fc184713bc1d3ba5e3825492bcc75 · Report to bf776d78-0b8a-44d3-9336-72a79e280ad7
- Bug: pill visible, pressing the action → "PromptKit needs one visible Composer." (`client/composer/web.ts` locateField requires exactly one visible root; host keeps several mounted). Fix must bind the pressed pill's agent to its Composer by positive DOM evidence; fail closed otherwise. If no relation exists in 0.8.0 → DEPENDENCY_REQUEST → Lead DECISION_REQUEST.
- v0.1.0 immutable; next release version undecided → DECISION_REQUEST when the candidate is ready.
- Unpushed on main: 0db4c1c, 6e6a5e8.

## Proposed paseo-prompt-kit-core-v0.2.0 — PROPOSED, G0-blocked (do NOT open implementation)

- Packet: docs/exec-plans/proposed/paseo-prompt-kit-core-v0.2.0.md (TEAM DEV) · source docs/CORE.md (DRAFT, tracked at b6e9a7f) · review docs/reviews/core-review-lead-claude-fable-5-1-20260921.md (verdict FINDINGS, self-review — needs a non-author lane).
- LOCKED UX (HUMAN_PRODUCT_DIRECTION 2026-09-21): clicking PromptKit runs the default flow directly with the current default action; the control exposes a menu only when additional flows are enabled in Settings; current menu item "Improve coding prompt". Locked for CORE proposal + future packet; NOT permission to reopen/implement CORE now. CORE.md/plan incorporate it in Phase 0, not before.
- G0 still requires TWO explicit Human decisions, kept SEPARATE, not inferred from the UX: (1) OQ-1/OQ-3/OQ-8 = trust model for Action Pack sources (Lead recommends bundled-only, one namespace); (2) OQ-4 = image scope. DECISION_REQUEST drafted in the packet, not yet sent.
- Do NOT open CORE implementation until ALL four settle: plan/CORE contract corrected (F-1..F-5 + UX section), independent non-author review, Human G0 decisions, and the v0.1.1 Composer resolver contract.
- Pack distribution DECIDED (Lead, verified against host source at b6e9a7f): a pack is one JSON file under `shared/packs/<id>.json`, registered via a static barrel, bundled by esbuild at compile time. Evidence the alternatives are dead: `.md` has no esbuild loader (`compiler.ts:405` build() has no `loader` option); a top-level `packs/` dir is rejected by the module boundary (`compiler.ts:76-87`, `pluginDirectory=dirname(entryPath)` :385); the daemon never learns its install dir (`plugin-process-protocol.ts:19-25` initialize carries only pluginId/bundle/appVersion/settingsDirectory; bundle run via `eval`, `plugin-process.ts:227`), so fs+install-dir is impossible without an upstream FR. `shared/` is already in package.json `files`, so no frozen `package.json` change is needed for packs. Third-party/user-dir packs are deferred (need the upstream FR).

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

- Immediate next action: await PEER_HAND_BACK from d3fa32ad; review the mechanism from the object (must be positive identity evidence, never 'the only visible'); confirm regression red→green and gate; then DECISION_REQUEST for the fix release version (proposal: v0.1.1) with push/tag commands. Next brief starts a new packet; re-read WORKSPACE_PROTOCOL.md, framework/protocol.md, framework/provider-routing.md, this file.
