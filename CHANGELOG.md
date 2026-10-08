# Changelog

## Unreleased

### Added

- Edit bundled **General** instructions directly in Settings, with a **Modified** marker,
  Save/Discard and a confirmed reset of only that prompt. Core rules stay visible and read-only.
  Instruction overrides keep the existing action identity and schema version `1`.
- Regression coverage for editable prompts, Composer identity changes, async lifecycle races,
  HTTP body deadlines, Codex startup deadlines, credential echoes and concurrent secret writes.
- Behavioural eval cases for every demo sample, including delegated planning, diagnosis-only
  requests, review without fixes, requirement strength and handoff unknowns. Model calls remain
  opt-in; fixture checks alone do not establish live model quality.

### Changed

- **Default prompts** and **Custom actions** now share one **Prompts** card: General first,
  saved custom prompts next, and **Add prompt** last. Editing General no longer requires a copy
  or adds a second menu choice. Existing custom prompts are not deleted or merged automatically.
- All six demo samples revised: Blank template runs safely without placeholders; Find the cause
  asks for plausible, evidence-backed hypotheses without a quota; Plan first preserves delegated
  choices while retaining its approval gate; Review asks for evidence rather than invented
  findings; Testable requirements preserves obligation strength without inventing criteria;
  Session handoff requests observed results and unknowns without a fixed number of steps.
  Saved custom prompts are independent copies and are not overwritten by a sample update.
- Shared injection and output instructions remain owned by Core instead of repeated in each
  sample. All samples still use the same registry, wrapper and rewrite engine.
- Codex keeps a warm process but uses a fresh ephemeral thread for every rewrite, rather than
  carrying drafts across turns. Startup is deadline-bound. A timeout closes the shared process
  and may fail other concurrent Codex rewrites; complete tool isolation still needs live verification.
- Debug traces record response/output sizes instead of HTTP bodies or CLI output excerpts;
  HTTP diagnostics redact known request credentials and account identifiers before truncation.
  CLI failures use fixed messages instead of forwarding raw provider errors, stderr or spawn
  exceptions to the UI or trace; exit codes remain available.
- README documents the unified editor, sample purposes, one-click behaviour, persistence and
  current limitations. Configuration readiness is not a provider-generation health check.

### Fixed

- Web rewrites stay bound to their starting Composer and require matching identity evidence
  before applying output; entry points share a busy lock for the same field. A delayed settings
  read no longer recreates a pill for an agent that was removed.
- HTTP timeout covers reading the response body, not only receiving headers; responses are
  capture-limited. Malformed model lists fail instead of masquerading as an empty valid list.
- Valid API provider mappings are no longer blocked by client checks of an unused default model.
- Discard closes prompt editors; failed saves retain instruction edits. Endpoint test results
  are ignored when their configuration changed, and other clients periodically refresh pills.
- Mobile sheet Send does not clear a newer Composer draft.
- Secret-file writes through the same plugin process are serialized by resolved path, preventing
  lost updates between those requests. External writers and separate processes are not locked.
- Output validation rejects a Vietnamese rewrite preface unless already present in the draft.

## 0.6.0 - 2026-09-29

### Added

- Custom-action samples rebuilt from the PromptKit library's protocols: **Find the cause** (root
  cause with evidence, hypotheses kept apart from confirmed causes), **Plan first** (plan, open
  questions, then wait for approval), **Review** (each finding disproved before it is reported),
  **Testable requirements** (the author's must / should / may kept as written) and **Session
  handoff**. They replace Execution brief, Review request and Make concise, which duplicated
  General or added nothing a model does not already do.
- A behavioural eval: `tests/eval` holds drafts with checks on what a model returns (roles and
  voice, questions, literals, injection text, constraint strength, approval gates). The unit suite
  proves every check can pass and fail; `tests/integration/rewrite-eval.test.ts` runs them against
  a real endpoint when `PASEO_LIVE=1` and `PASEO_EVAL_*` name a cheap model.
- Output languages 日本語, 中文, 한국어, Español, Français and Deutsch ship alongside English and
  Tiếng Việt; each is one JSON file under `shared/languages/`.
- Eval cases for a Japanese draft, a Chinese draft, mixed Vietnamese-English and
  Japanese-English drafts, and both directions of the Output language setting; the runner passes
  a case's output language into the task the model sees.
- The `rewrite success` log line carries `modelMs` next to `durationMs`: the time of the model
  call alone, so a slow rewrite is blamed on the endpoint or on the plugin without the debug log.

### Changed

- `General` and every custom-action sample are written in English, examples included. The
  Vietnamese verbs and examples that every user paid for on each rewrite are gone; the rewrite
  follows the draft's language through Core's contract, and the examples say so. One last
  example mixes Vietnamese and English on purpose, because a rule alone did not keep a small model
  in the draft's language for a mixed draft; measured with the new eval cases.
- Core's language rule names how to pick a mixed draft's language: the one its verbs and
  connecting words use, not its technical terms.
- Core's rewrite contract now carries the rules every action shares: keep each participant's
  identity and role, and never invent facts. `General` and the samples no longer repeat them.
- Every rewrite now avoids machine-written tells: no em dash the draft does not use, no
  "Certainly!" or "I'd be happy to", no closing offer of help.
- `General` keeps the order of the author's steps and every stop, wait or ask-first gate, puts the
  done check after the last step, and tells the agent to report unrelated problems it notices
  instead of fixing them. Its closing self-check is shorter.

## 0.5.8 - 2026-09-27

### Added

- **Debug log** switch under Settings → Advanced. Off, the plugin log keeps one line per rewrite
  (`rewrite success`, or `rewrite failed` with the error code, transport and duration; the old
  `rewrite start` line is gone). On, every rewrite also writes `debug` lines tagged with one
  `request=` id: resolved target, CLI command line with exit code, timing and stdout/stderr
  excerpts, or HTTP URL, status, rate-limit headers and a body excerpt. Keys and Cloudflare
  account ids are never written. README has a new **Reporting a bug** section.
- README notes how to keep text exactly as written: wrap it in backticks or a fenced block, or
  attach long material as a file and refer to it.

### Changed

- `codex` rewrites run on a warm `codex app-server` instead of one `codex exec` per rewrite.
  codex keys the prompt cache by thread, so reusing a thread that already carries the rewrite
  rules takes a rewrite from about 7 s to 2.4–3 s after the first one (measured with
  `gpt-6-luna`, low effort). A thread serves one model and one set of rules, runs at most 8
  rewrites and is dropped; concurrent rewrites get their own thread; a timed-out rewrite is
  interrupted and its thread dropped. Threads live in memory only, and the server stops after 10
  idle minutes or with the plugin.

### Fixed

- A short rewrite through Groq no longer fails with HTTP 429 "Request too large ... output tokens
  per minute (OTPM)". The `openai` protocol sent no output limit, so Groq reserved its own output
  estimate, which a free tier's 1000-token OTPM limit rejected even for a short draft. It now
  sends `max_completion_tokens` sized from the draft (256 plus about 1.5 times the draft's tokens,
  at most 8192). The `anthropic` protocol uses the same size for `max_tokens` instead of a fixed
  4096, which Anthropic also reserves against the per-minute output limit.
- `codex` and `opencode` rewrites now run under the rewrite rules. Both families dropped the
  system prompt, so the model saw only the task and the draft: nothing kept the author's voice,
  the literals or the output-only shape. `codex` gets it as the thread's developer instructions;
  `opencode` gets an inline agent through `OPENCODE_CONFIG_CONTENT` with every tool off.
- A rewrite the model cut off at its output token limit is refused with `api_bad_response` (API)
  or `generation_failed` (CLI) instead of reaching the Composer half-written.
- A slow rewrite now ends with PromptKit's own timeout message instead of Paseo's bare
  "Plugin RPC timed out". The daemon drops a plugin call at 30 s while the default timeout was
  90 s; a rewrite now stops at 27 s whatever the setting says, and the default is 25 s.
- The `claude` CLI starts faster and more predictably: it runs with no tools, without your MCP
  servers, hooks and skills, and without saving a session. Loading those on a cold start could
  push `claude-haiku-4-5` past the 30 s cap.
- CLI failures now name their real cause. `opencode` exited 1 with an empty stderr; `pi` exited 0
  after a failed request; `claude` could end with an `error_*` subtype; `codex` hid the provider
  error behind "Reading prompt from stdin...". Each is now read from the CLI's own output (for
  codex, the failed turn's message), and a CLI that prints no answer names itself and its stderr.

## 0.5.7 - 2026-09-25

### Added

- The PromptKit pill now shows a rewrite's progress: **Rewriting...** with a purple border,
  label and icon while a request is in flight, then **Rewritten** in green for 2 seconds once
  the Composer holds the result. Both the pill and `/rewrite` drive the same status, so a
  `/rewrite` run colors every pill in the workspace since it has no single agent to target.

## 0.5.6 - 2026-09-25

### Fixed

- **General** no longer turns a question into an instruction. A draft such as "did you already
  run the migration? does billing need anything else?" kept only the imperative reading and
  dropped the question; the rewrite now keeps a question a question, states it clearly, and
  never appends steps or a "done" check to it. Draft parts that do ask for an action are still
  turned into clear instructions as before.

## 0.5.5 - 2026-09-23

### Fixed

- The **Groq** preset is back in the API endpoint list: OpenAI-compatible,
  `https://api.groq.com/openai/v1`, key variable `GROQ_API_KEY`, listed A–Z between Google Gemini
  and Local server. 0.3.1 removed it by mistake; Groq was only meant to stop being the example
  in the documentation, which still uses Gemini.
- Mobile sheet: with several enabled actions, the action buttons now sit in two equal columns.
  A lone button on the last row keeps its column's width instead of stretching past it.

## 0.5.4 - 2026-09-23

### Fixed

- A failed Provider CLI run no longer replaces the Composer text with the CLI's error. A Claude
  Code result flagged `is_error` (for example "Failed to authenticate: OAuth session expired")
  used to be taken as the rewritten prompt; it is now refused with the CLI's reason. Any CLI run
  that exits with a non-zero code or a signal is refused too, naming the first line of its
  stderr.

### Changed

- README: a shorter introduction that names all three rewrite paths, a **General action** section,
  the mobile sheet with several actions, Custom actions as its own Settings entry, the current
  **Store API key** row names, and `invalid_model` in the API failure codes. Repeated sentences and
  stale lines were removed.
- Examples in the README, code comments and tests use generic provider and model names
  (`pi`, `codex`) instead of names from one machine's setup.

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
