# Provider Routing

Default route table for every seat. Advisory: Human instruction overrides; the
runtime catalog decides availability. A route never changes disposition,
writable scope, or acceptance authority. The project's `WORKSPACE_PROTOCOL.md`
may pin project-specific routes; that pin wins inside its repo.

## Rules

- Inspect the live provider/model catalog before routing; never guess IDs.
- Route only to role entries: `<provider>-lead`, `<provider>-peer`,
  `<provider>-review` (`codex-peer/gpt-5.6-luna`, `claude-peer/claude-sonnet-5`).
  The bare `codex`, `claude`, `opencode`, `grok` entries are Human launchers
  with no role contract or seat guard; a seat on one is `RECONCILE_REQUIRED`,
  never a substitute when the role entry is unavailable (that is `BLOCKED`).
- Record requested vs effective route; a mismatch is reported
  (`RECONCILE_REQUIRED`), never silently substituted. Unavailable → `BLOCKED`.
- Raise thinking on the same model before switching model.
- Independent review uses a different provider than the implementer, so
  failure modes are not shared. A verifier is a fresh seat with no prior
  participation in the case.
- Choose the cheapest route that still meets the verification target; classify
  by uncertainty, blast radius, and reversibility — not file count or
  duration. Downgrade when uncertainty drops.
- For implementation, `pi-peer/workbuddy/deepseek-v4.1-flash` supports only
  `low`, `high`, and `max`: start at `low`, raise to `high` when the task's
  uncertainty or risk requires it, and use `max` only when an unusually long
  scope remains after it has been split as far as practical. Review lanes use
  their own risk-based thinking level.
- For a Pi-based Dual Lane Review, use
  `pi-peer/workbuddy/deepseek-v4.1-flash` at `high`; do not use `max` for that
  lane.

## Defaults by capability class

| Work | Route |
|---|---|
| Implement — standard | One Peer per disjoint scope: `pi-peer/workbuddy/deepseek-v4.1-flash` `low` first, then `pi-peer/workbuddy/hy4-preview-f` `high`, then `pi-peer/workbuddy/hy3` `high` |
| Implement — hard (after inspection: the remaining scope is hard, not wide) | `pi-peer/workbuddy/deepseek-v4.1-flash` `high`; use `max` only for an unusually long scope that remains after splitting; then `pi-peer/workbuddy/hy4-preview-f` or `pi-peer/workbuddy/hy3` `high` |
| Implement — fast mechanical / bounded | `gpt-5.6-luna` `low` (fallback `claude-haiku-4-5` `low`→`medium`) |
| Review | see Review lanes below |
| Verifier | fresh `gpt-5.6-luna` `max`, affected evidence only |
| Gate runner (one full gate per batch, detached, log at the protocol's gate log path) | the implementer that already holds the runtime, or `opencode-peer`/`gpt-5.6-luna` `low` — it launches and reports, it does not judge |
| Lead | long context first, strength by batch: `claude-lead/claude-opus-4-8[1m]` `high` for a hard batch (wide decision surface, many seats, long integration); `claude-lead/claude-sonnet-5[1m]` `high` for an ordinary batch; `codex-lead/gpt-5.6-luna` `high` when Claude quota forbids; `gpt-5.6-sol` only when the Human names it. When the Lead and its Supervisor share a quota, the Lead keeps the stronger model |

## Review lanes

The protocol's Review ladder escalates: Lead handback review → dual lane →
three lanes → council. Lanes are blind to one another — never seed a lane with
another lane's findings.

| Lane | Route |
|---|---|
| Lead handback review | the Lead seat itself; no extra seat |
| Human override — Pi Dual Lane | `codex-peer/gpt-5.6-luna` `high` + `pi-peer/workbuddy/deepseek-v4.1-flash` `high`; Deepseek does not use `max` in this lane |
| Macro semantic reviewer (dual lane) | provider ≠ implementer: `codex-peer/gpt-5.6-luna` `high` vs `claude-peer/claude-opus-5` `high` |
| Semantic pair (three lanes) | `codex-peer/gpt-5.6-luna` `high` + `claude-peer/claude-opus-5` `high` — different families, sealed, run under `dual-seat-adjudication` |
| Adjudication pair (decision question, analysis-only) | `opencode-peer/workbuddy/deepseek-v4.1-flash` `high` + `opencode-peer/workbuddy/hy4-preview-f` `high` — different families, sealed, run under `dual-seat-adjudication` |
| Adjudicator (only when the pair disagrees) | one sealed seat from a third family: `codex-peer/gpt-5.6-luna` `high` for the adjudication pair, `opencode-peer/workbuddy/hy4-preview-f` `high` for the semantic pair; reads both reports unattributed, never edits |
| Coverage lane | OCR delegation, no skills, findings are evidence, never a vote — `codex-review` (`gpt-5.6-luna` `max`, hard-wired) or `claude-review` (`claude-sonnet-5[1m]` `high`/`xhigh`/`max`, default `high`); interchangeable, Lead picks the provider per epic (or runs both blind to each other for cross-provider coverage) |
| Corrections pass (after convergence) | one writable seat — the implementer or a fresh Peer, Lead's choice |

Only the `codex-review` and `claude-review` profiles know OCR. Never mention
OCR to any other seat — rule-tool awareness degrades architectural review.
The Lead does not run OCR itself.

## Access modes per provider

Copy these values straight into `create_agent.settings` (`modeId`,
`thinkingOptionId`, `features`) on every create — this table is the source,
not a fallback. It is also the check a Lead runs on every seat it created; a
seat missing its row is `RECONCILE_REQUIRED` and is corrected with
`update_agent` before its first prompt lands.

| Provider | Mode |
|---|---|
| Codex | always Full Access (`modeId=full-access`, `sandbox_mode=danger-full-access`) |
| Claude | Auto mode when launched by Paseo; the seat `settings.json` pins `permissions.defaultMode=bypassPermissions` for manual launches. Deny rules and the dcg PreToolUse hook apply in both |
| OpenCode | `settings: { modeId: "build", features: { auto_accept: true } }` on every create; Auto Accept is a feature, not a mode, and is never inherited from the caller. Never `plan` — it breaks the handback path |
| Antigravity | `settings: { features: { auto_accept: true } }` on every create (`--dangerously-skip-permissions` in the launcher) |

`dcg` is the pre-exec guard behind these modes and must be present before any
full-access/auto dispatch. A read-only assignment stays read-only by
disposition whatever the effective mode allows; the dispatch carries
`REVIEW: DO NOT EDIT FILES`.

## Hard constraints

- `gpt-5.6-sol`: Lead only, when the Human names it, up to `high`. Any other
  use needs a `Human override:` line in the brief.
- Exactly one `isDefault` model per provider entry; catalog, launcher overlay,
  and this table must agree for the same seat class.
