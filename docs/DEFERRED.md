# Deferred Register

Proposals and follow-ups ruled "not now". One row each; the Lead is the only
writer, the Human decides when a row is taken up. Never delete a row: change
its state. The ruling itself lives in `decision-log.md`; this file is the
index that keeps deferred items findable without reading the whole log.

Rules:

- Every `DEFER`/`DEFERRED` ruling in `decision-log.md` adds one row here with
  the next `DEF-nnn`; the DLF entry cites the `DEF-nnn`, not the description.
- Taking an item up is a new DLF that names the `DEF-nnn`; the row becomes
  `TAKEN_UP DLF-xxx`. Ruling it out for good: `DROPPED DLF-xxx`.
- `Revisit when` is an observable trigger (a decision made, a dependency
  landed, a date), never "later".
- `MEMORY.md` carries one line only: `Deferred: N open — docs/DEFERRED.md`.

| ID | Item | Deferred at | Source | Revisit when | State |
|---|---|---|---|---|---|
| DEF-001 | Protected-literal validator ignores bare commands mid-sentence (rule anchors at line start), e.g. `… using npm run gate` dropped by a rewrite is not detected | 2026-09-21 | DLF-003 / pk-UkLWZ.1 | QA matrix in pk-UkLWZ.4 shows a real mid-sentence command loss, or the validator is next touched | OPEN |
| DEF-002 | Absolute path whose last segment is one character truncates (`/Volumes/x` → `/Volumes`) | 2026-09-21 | DLF-003 / pk-UkLWZ.1 | Validator is next touched | OPEN |
| DEF-003 | Desktop/Web UI QA rows (visual single pill, switch-agent and edit-during-request in the live UI, theme) have no browser evidence: no seat in the room has the MultiZen MCP client | 2026-09-21 | DLF-008 / pk-UkLWZ.4 | Human opens a browser-QA batch; MultiZen profile 20def08f-9a62-4932-9d49-f7c5ab12c6d0 is now reachable from the Lead runtime | TAKEN_UP DLF-011 (rows re-verified live; theme row excluded by directive) |
| DEF-004 | License file and `package.json` license field absent; DECISION_REQUEST (MIT / Apache-2.0 / none) unanswered at closeout | 2026-09-21 | DLF-008 / pk-UkLWZ.4 | Human answers the license DECISION_REQUEST | TAKEN_UP DLF-009 (MIT; lands in the next release-owned change) |
| DEF-005 | npm package scope / publish and release tag undecided (brief open question); `private: true` keeps npm publish impossible | 2026-09-21 | DLF-008 | Human decides npm scope and tag | TAKEN_UP DLF-009 (tag v0.1.0; npm deferred, name undecided) |
| DEF-006 | Host-load regression test depends on an esbuild binary found via `ESBUILD_BINARY_PATH`, a project install, or the Paseo.app bundle; it skips (with reason) elsewhere, so CI without Paseo.app would not run it | 2026-09-21 | DLF-011 / pk-OIJLh.3 | A CI/gate host without Paseo.app is introduced, or adding `esbuild` as a devDependency is decided | OPEN |
| DEF-007 | Theme/readability check (row G) has no browser evidence; theme mutations stopped by HUMAN_PRIORITY_DIRECTIVE | 2026-09-21 | DLF-011 | Human asks for a narrowly scoped theme check | OPEN |
| DEF-008 | The daemon rejects any plugin RPC after `REQUEST_TIMEOUT_MS = 30_000` (`@getpaseo/server` `plugins/runtime.ts`, verified in the installed Paseo 0.8.0), while `prompt-kit` advertises `timeoutMs` up to 600_000. A rewrite that outlives 30s therefore fails in the host with `Plugin RPC timed out` before the plugin's own timeout can fire, and a user-chosen 90s budget is unreachable. Measured cold runs: `opencode` 36.3s, `codex` 41.4s — above the cap; the `claude/claude-haiku-4-5` live row passed warm at 12.4s and failed cold at 30008ms, so the cap reaches the gate too. The CLI runner still kills the process tree at its own timeout, so no process is leaked; only the reported failure is the wrong one. Mitigated in tests by making the live rows opt-in (`PASEO_LIVE=1`); the production symptom is untouched | 2026-09-21 | DLF-014 / live two-path probe | The plugin's `timeoutMs` is lowered under the cap, the rewrite is made resumable, or upstream raises `REQUEST_TIMEOUT_MS` for `plugin.rpc.invoke` | OPEN |
