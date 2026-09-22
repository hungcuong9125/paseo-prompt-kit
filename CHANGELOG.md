# Changelog

## 0.5.3 - 2026-09-23

### Added

- README: **Install from npm** section with `paseo plugin add npm:paseo-prompt-kit`, now the
  recommended install. No code changed.

## 0.5.2 - 2026-09-23

### Changed

- Packaged for npm as `paseo-prompt-kit`: `package.json` is no longer private and carries the
  package name, keywords, author, homepage, repository and bugs links. The plugin id stays
  `prompt-kit`; no code changed.

## 0.5.1 - 2026-09-23

### Added

- **Custom actions** in Settings: write your own action as action-pack JSON in a text box on the
  settings screen. **Add** opens a sample to edit (Blank template, Plan first, Review request,
  Make concise, Copy of General, Execution brief, or a copy of one of yours); **Apply** checks
  it against the pack schema and rejects an id another action uses; **Save** stores it in the new `customActions` setting. A
  custom action runs through the same registry and rewrite path as the bundled ones.
- On mobile, with two or more actions enabled, the sheet shows one button per action and waits
  for a choice instead of rewriting with the first one.

### Changed

- The bundled action is renamed from **Improve prompt** to **General**, the title the pill,
  its menu and Settings show; its id stays `general`. It is the only bundled action.
  **Execution brief** is no longer bundled; it is a sample under Custom actions, and a saved `actionEnabled.brief` switch no longer applies.
- At most 6 actions can be on: further switches are locked with a note, a new custom action
  starts off when the set is full, and Save is blocked above the limit.
- A lone action shows as **Always on** instead of a switch.
- The Composer pill follows a Save at once: it turns into a menu, back into a direct button,
  disappears or comes back as the enabled set changes, instead of keeping the shape it had when
  the agent appeared.
- `prompt-kit.actions.list` takes the caller's `customActions` and returns each action marked
  bundled or custom, plus the packs it rejected.

## 0.5.0 - 2026-09-23

### Added

- **Execution brief** action (off by default): the draft as labelled parts — goal, context,
  constraints, approach and done when — with labels in the draft's language.
- A rewrite contract owned by Core, placed ahead of every action's instructions: the rewritten
  text is sent as the author's own words, so it keeps the author's first person, speaks to the
  agent directly, keeps the draft's register, and never refers to the author as "the user".

### Changed

- The default action is now `general` (**Improve prompt**) instead of `coding`. It turns the
  draft into a clear instruction: the concrete action, each constraint made checkable, the
  working steps for that kind of task (find the cause before changing code, follow how the
  codebase already does it, keep the change scoped), and how the agent knows it is done. It
  never invents files, numbers, requirements or decisions, and keeps each constraint at its
  original strength. A saved `actionEnabled.coding` switch no longer applies.
- The draft reaches the model inside `<draft>` instead of `<user_prompt>`. The output language
  instructions translate every sentence, verbs and connecting words included, in the author's
  own voice, while established technical terms may stay; a mixed-language draft is written in
  its main language. The rewrite adds no quotation marks the draft did not have.
- Action packs carry only what their action changes; the injection boundary, literal, language
  and output rules now live in Core's contract.

## 0.4.0 - 2026-09-23

### Added

- Cloudflare Workers AI as a Direct API protocol and preset: `POST
  <base>/accounts/<account id>/ai/run/@cf/...` with a bearer token (`CLOUDFLARE_AUTH_TOKEN`),
  `result.response` as the answer, and **Test** listing the account's text-generation models.
  `max_tokens` is sent as 2048 so the service's 256-token default cannot truncate a rewrite.
- **Account ID** row for Cloudflare, above Key variable, prefilled `CLAUDFLARE_ACCOUNT_ID`. It
  names the variable holding the account id, read from the endpoint's Key source like the token,
  so `secrets.json` can hold both. With `secrets.json`, the account id can be stored from
  Settings the same write-only way as the key.
- A **Filter models** row above Model, in the Dedicated model and API endpoint sections, narrows
  the Model dropdown by name or id when the list has more than 8 models. The saved model always
  stays listed. The dropdown itself is the host's (220 px, no search), which plugins cannot
  widen or search.

### Changed

- The endpoint list is sorted A–Z across presets and saved custom endpoints, with
  **Custom endpoint…** last; a saved custom endpoint shows its protocol after the name.
- The Model field's hint shows a model id of the endpoint's own protocol instead of always a
  Gemini one.
- The write-only storage rows are named after what they store: **Store API key** /
  **Remove stored API key**, and **Store Account ID** / **Remove stored Account ID** for Cloudflare.

### Fixed

- The Key source hint, the missing-variable message and README claimed that Paseo opened from
  Finder has no shell variables. Paseo Desktop does read the login shell's environment, but only
  once, at start; they now say that a variable added later needs Paseo quit and reopened.

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
