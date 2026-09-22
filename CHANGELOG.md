# Changelog

## 0.3.0 - 2026-09-23

### Added

- Direct API rewrite transport: post straight to an OpenAI-, Anthropic-, or Gemini-shaped
  endpoint (Groq, OpenRouter, a local server, or any compatible gateway) instead of spawning a
  CLI, with an endpoint editor and a **Test** button in Settings.
- Output language selection (`Same as the prompt` / `English` / `Tiếng Việt`), user-extensible
  by dropping one JSON file under `shared/languages/` — see `docs/guides/output-languages.md`.
- The `/rewrite <prompt>` slash command, usable on a draft Composer before an agent exists.
- The PromptKit sheet: a mobile bottom sheet that opens pre-filled with the Composer's text,
  rewrites at once, and offers Rewrite-again / Send / close, reaching the native Composer
  through the app's React tree since mobile has no DOM.
- The Action Pack extension point: an action is one bundled JSON file under `shared/packs/`,
  documented in `docs/CORE.md`, `docs/EXTENDING.md`, and `docs/guides/action-packs.md`.
- `prompt-kit.actions.list` and `prompt-kit.api.test` RPCs.

### Changed

- Rewrite transport: replaced the temporary background agent with a headless call to the
  provider's own CLI — no tab, no agent, no archive, and the primary conversation never gains a
  turn.
- Settings screen: full redesign — a status bar (readiness + Save/Discard), ordered sections,
  and a draft/patch model instead of saving each field immediately.
- `CLI per provider` and `Endpoint per provider` now list only the providers you've mapped, plus
  an Add row, instead of every provider the daemon knows about.
- Minimum Paseo version raised to `>=0.9.0` (`paseo-plugin.json`), required for the mobile sheet
  and the `/rewrite` command.
- Settings menu entry renamed from "PromptKit" to "Settings".
- `Model source` is now a Provider CLI setting only. Direct API always shows a **Model** row in
  the API endpoint section and ignores `modelMode`; a provider mapped under Advanced still
  sends its agent's own model.
- Rewrite engine rows: the hint stops short of the dropdown, so the text and the control read
  as two separate columns on wide layouts.

### Fixed

- Composer detection now treats a hidden (`display:none`) ancestor as not visible, instead of
  finding a stale, off-screen Composer.

## 0.1.0 - 2026-09-21

Initial public release: one bundled action (`Improve coding prompt`), the `PromptKit` pill,
Desktop/Web only, rewriting through the current agent's own provider CLI or a dedicated
provider/model you pick in Settings.
</content>
