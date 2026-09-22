# Changelog

## 0.3.1 - 2026-09-23

### Added

- **Key source** per API endpoint — `Environment variable`, `secrets.json` or `No key` — chosen
  in the API endpoint section. The daemon reads the key from that source only.
- `docs/templates/secrets.template.json`: a starting `secrets.json` holding several keys, with
  copy and `chmod 600` steps in README → API keys.
- A successful **Test** names the source the key was read from.
- Examples use Google Gemini with `gemini-2.5-flash-lite`.
- Optional **API key** field for endpoints whose Key source is `secrets.json`: **Save** writes
  that one entry to `secrets.json` on the daemon (`0600`, atomic, other entries kept) and
  **Remove stored key** deletes it. Write-only — the screen only shows whether a value is stored.
  README warns that the key crosses the Paseo connection once and recommends an environment
  variable or editing `secrets.json` by hand first.
- `prompt-kit.secrets.write` and `prompt-kit.secrets.status` RPCs; neither returns a key.

### Changed

- **Secrets directory** moved from Advanced into the API endpoint section and appears only for
  endpoints whose Key source is `secrets.json`. It is shared by all of them.
- Endpoint presets are OpenAI, Anthropic, Google Gemini, OpenRouter and Local server, in that
  order. The Groq preset is removed; an existing Groq endpoint keeps working as a custom
  endpoint, and a new one is added through **Custom endpoint…** with protocol OpenAI-compatible.
- Breaking: the settings field `secretsFile` is now `secretsDir`; a custom directory must be
  entered again.
- Breaking: an endpoint saved without `keySource` reads its key from the environment. Switch it
  to `secrets.json` if it relied on that file, or to `No key` for a local server with an empty key
  variable.

### Fixed

- The environment silently won over `secrets.json`: with a key in both, the file's value was
  never used and nothing said so. Each endpoint now reads exactly one source, with no fallback.
- A missing key reported one generic message; it now says whether the variable is unset, the
  file is missing, the entry is absent, the file is malformed, or the directory is invalid.
- A secrets directory written as `~/…` was not expanded, and a relative one was resolved against
  the daemon's working directory. `~/` is now expanded and a relative path blocks Save.
- An endpoint that needs a key could be saved with an empty key variable and failed only at
  rewrite time; Save is now blocked with the reason.

## 0.3.0 - 2026-09-23

### Added

- Direct API rewrite transport: post straight to an OpenAI-, Anthropic-, or Gemini-shaped
  endpoint (OpenAI, Anthropic, Google Gemini, OpenRouter, a local server, or any compatible
  gateway) instead of spawning a CLI, with an endpoint editor and a **Test** button in Settings.
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
