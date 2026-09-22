# PromptKit Core — As-built architecture (v1)

> **Status:** AS-BUILT — describes the structure running on `main`.
> **Contract:** one live path only; no dual-read, no shims, no version branches (`AGENTS.md`).
> **Adding a feature:** see `docs/EXTENDING.md` (read before touching code).

This document answers three questions: which modules make up Core, what each module is
responsible for (one sentence, no "and"), and which boundaries are imposed by the Paseo host
rather than chosen by us.

---

## 1. Host constraints (non-negotiable)

Paseo's plugin compiler (`packages/server/src/server/plugins/compiler.ts`, `directoryTarget`)
accepts only **three root directories**:

| Directory | Bundle | Importable from |
|---|---|---|
| `client/` | client (runs inside the Paseo app, React Native Web) | `client/`, `shared/` |
| `server/` | server (runs inside the daemon, Node 20) | `server/`, `shared/` |
| `shared/` | both | `shared/` only |

Plus the two entry files `index.client.tsx` and `index.server.ts`. **Any other root directory
is rejected** at build time (`"invalid"`), so CORE modules live **inside** these three
directories rather than in a top-level `core/` or `packs/`.

Second consequence: the daemon never knows where the plugin lives on disk (the bundle is
`eval`'d, no install dir). So an Action Pack is **JSON bundled at compile time**, not a
directory read at runtime.

---

## 2. Layout and one-sentence responsibilities

```text
index.client.tsx                 Registers pills, the /rewrite command, panel and Settings screen; no DOM → pill opens a sheet.
index.server.ts                  Registers settings and the four RPCs; the daemon's composition root.

shared/                          Contract shared by both bundles
  packs/                         ★ ACTION PACKS — plain data, one JSON per action
    index.ts                       Static barrel: the list of bundled packs.
    coding.json                    The built-in `coding` pack, on the same path as any other pack.
  languages/                     ★ OUTPUT LANGUAGES — plain data, one JSON per language
    index.ts                       Static barrel; `source` (keep the original language) is the built-in default.
    en.json, vi.json
  language-registry/             Loads, validates, and looks up output languages (schema/loader/registry)
  action-registry/               Loads, validates, and looks up Action Definitions
    schema.ts                      The Action Pack v1 contract (zod strict) + ACTION_ID_PATTERN.
    loader.ts                      Turns the barrel into a registry; a broken pack is rejected on its own.
    registry.ts                    The one live registry; listActions / resolveAction.
    wrapper.ts                     Core's injection boundary: <task>/<user_prompt> + escaping;
                                   inserts "Output language: …" into <task> when an output language is set.
  settings.ts                    Host-scoped settings schema + the TIMEOUT_MS constants.
  rpc.ts                         The four RPC contracts: rewrite, actions.list, providers, api.test.
  api-protocol.ts                The list of API protocols and the schema for one endpoint.
  cli-families.ts                The list of CLI families + the rule for inferring a family from a provider id.
  protected-literals.ts          Extracts literals that must survive a rewrite unchanged.

client/                          The app-side contribution
  composer-bridge/               Finds the one visible Composer and reads/writes/focuses it
    adapter.ts                     Platform-neutral interface.
    dom.ts                         Selector + visibility check along the ancestor chain.
    web.ts                         DOM implementation for Desktop/Web.
    fiber.ts                       Native: finds the Composer's MessageInputRef for an agentId via the React tree (replaceText also updates the live state).
    effect.ts                      "Rewriting…" effect: dims the field + sweeps a light beam, removed on completion.
  pills/                         One pill per live agent, and the guarded rewrite path
    agent-pills.ts                 Registers/removes pills per agent directory; pill shape follows set E.
    rewrite-runner.ts              run(): Composer → RPC → replaces text if the snapshot still matches;
                                   runText(): text → RPC → inserts into the Composer if it is still empty.
  commands/rewrite-command.ts    The /rewrite <prompt> command, workspace scope (new seat, agentId null); Desktop/Web only.
  sheet/rewrite-sheet.tsx        The pill's popover on mobile: opens by reading the Composer and rewriting at once; Send sends + clears the Composer; ✕ leaves everything as it is.
  actions/enabled.ts             Set E: actions that are loaded and enabled by the user.
  icon.ts                        The plugin's single icon.
  settings/                      The Settings screen (feature folder)
    settings-screen.tsx            Composition root: status bar + sections in order.
    draft.ts                       Draft hook: functional patches, save by revision, discard, epoch.
    readiness.ts                   Pure: whether rewrite can run, through which path, and why not.
    validation.ts                  Pure: why saving is blocked (timeout, endpoint, mapping).
    selection.ts                   Pure: checks the dedicated/API selection (shared with the runner).
    read-settings.ts               Reads settings via host RPC for code outside the React tree.
    api-endpoints.ts               Endpoint presets + validateEndpoint.
    sections/                      One file per section, shown based on Transport/Model source
      actions-section.tsx
      engine-section.tsx
      dedicated-model-section.tsx
      api-endpoint-section.tsx
      advanced-section.tsx
    ui/                            Three small primitives outside the host kit: tokens, Button, Notice, StatusBar

server/                          The daemon-side contribution
  rewrite-engine/                Runs one resolved rewrite and returns a validated result
    engine.ts                      resolveTarget → transport → validateRewriteOutput.
    handler.ts                     The `prompt-kit.rewrite` RPC: resolves the action, logs no content.
    output-validator.ts            Rejects preface/refusal/commentary/lost literals.
  model-resolver/                Decides the provider/model/thinking option and transport for a request
    resolver.ts                    Three paths: current-CLI, dedicated-CLI, API. Fails closed.
    provider-catalog.ts            Reads the daemon catalog + availability state.
  transports/                    How a prompt reaches a model
    cli/                           family.ts (4 CLIs), process.ts (spawn, kill tree), runner.ts (scratch dir)
    api/                           protocol.ts (interface), openai/anthropic/gemini.ts, key.ts, runner.ts
  log.ts                         Logging that never carries a prompt or an output.
  paseo-types.ts                 Paseo types inferred from the server SDK (never imports the client package).
```

Placement rule: whatever doesn't fit a module's one-sentence responsibility belongs to the
module that owns it, or to a new module named after it. No `utils/`, `common/`, `helpers/`.

---

## 3. A single rewrite pass

```text
pill press
  └─ rewrite-runner.run(actionId)
       ├─ composer-bridge.readText()            ← rejects if 0 or >1 Composer is visible
       ├─ read-settings + selection (pre-flight) ← turns config errors into a sentence, never reaches the daemon
       └─ rpc prompt-kit.rewrite ──────────────────────────────────────────────┐
                                                                               ▼
                                            handler: resolveAction(actionId) ← unknown_action
                                                     buildTaskPrompt (Core's wrapper)
                                            engine:  resolveTarget ──► resolver (3 paths)
                                                     transports/cli | transports/api
                                                     output-validator (protected literals)
       ┌───────────────────────────────────────────────────────────────────────┘
       ├─ isActive() && readText() === snapshot   ← text changed mid-flight → leave it alone
       └─ composer-bridge.replaceText + focus     ← never auto-sends
```

---

## 4. Action Pack v1 contract

A pack is **data**: JSON, no code, no file paths. Strict schema in
`shared/action-registry/schema.ts`:

| Field | Constraint |
|---|---|
| `schemaVersion` | literal `1`. No v2 branch. |
| `id` | `^[a-z][a-z0-9-]*$`, unique within the barrel; a duplicate id rejects **both** packs |
| `version` | positive integer; used only for logging and display |
| `enabledByDefault` | boolean; the user overrides it via `actionEnabled[id]` |
| `title`, `description`, `icon` | non-empty strings; `icon` is a Lucide name, a wrong name renders blank |
| `context.mode` | `"prompt-only"` |
| `output.mode` | `"replace-composer"` |
| `system`, `task` | instruction text, ≤ 50,000 characters; must **not** wrap itself in `<task>`/`<user_prompt>` |

Fails closed: a broken pack ⇒ absent from `actions.list`, logs `action packs rejected`, other
packs keep working, no default action.

The injection boundary belongs to Core (`wrapper.ts`); packs must not wrap themselves. Prompt
text inside a pack is content **the plugin author** wrote, unlike `<user_prompt>`, which is
untrusted data.

---

## 5. RPC

| RPC | In | Out |
|---|---|---|
| `prompt-kit.rewrite` | `actionId` (regex), `agentId` (null on a draft), `workspaceId`, `originalPrompt` ≤ 50,000, `settings` (a snapshot; host 0.8.0 doesn't let the server read settings) | `ok{rewrittenPrompt, model, durationMs}` or `error{code, message}` |
| `prompt-kit.actions.list` | `{}` | loaded, valid actions, **before** settings are applied |
| `prompt-kit.providers` | `cwd?` | daemon catalog + `available` |
| `prompt-kit.api.test` | one endpoint + `secretsFile` | a model list or a coded error |

The pill menu is built from `actions.list`, no static import. The enabled set `E` is computed
on the client (`client/actions/enabled.ts`).

---

## 6. Settings (host-scoped, version 1)

Two independent axes decide the run path: `transport` (`cli`|`api`) × `modelMode`
(`current`|`dedicated`). The remaining fields follow from these two:

- CLI: `dedicatedProvider/Model/ThinkingOptionId`, `providerCli` (per-provider family override).
- API: `apiEndpoints[]`, `apiEndpointId`, `apiModel`, `apiEndpointByProvider`, `secretsFile`.
- Shared: `timeoutMs` (`TIMEOUT_MS.min..max`, default 90,000; the host caps the RPC at 30s —
  DEF-008), `actionEnabled`, `outputLanguage` (`source` or a loaded id; an unknown id ⇒
  `invalid_selection`).

An API key **never** lives in settings (this document reaches the browser); only the variable
name does, its value is read on the daemon from env, then `secrets.json`.

---

## 7. Locked decisions (answers to OQ-1..OQ-8 from the proposal)

| OQ | Decision |
|---|---|
| OQ-1 Pack source | **Bundled-in-plugin** packs only (`shared/packs/`). Packs from a user directory or the network need an upstream FR (the daemon doesn't know the install dir). |
| OQ-2 Compatibility | A `schemaVersion` other than `1` ⇒ the pack is rejected. Changing the shape means editing schema v1 and every pack at once (hard cut). |
| OQ-3 Identity | One flat namespace; `id` is unique within the barrel; a clash rejects both. |
| OQ-4 Per-pack settings | None. `actionEnabled[id]` is the only level. |
| OQ-5 Pack validity | Strict schema + a 50,000-character limit. No `{{prompt}}` placeholder: Core wraps it itself. |
| OQ-6 Injection | `escapeWrapperDelimiters` lives in Core. |
| OQ-7 Protected literals | The validator runs on `originalPrompt`, independent of the pack. |
| OQ-8 Trust | Pack prompt text is content the plugin author wrote; third-party packs don't exist in this build. |

---

## 8. Extension points

There are five named extension points, each one directory and one registration step. Details:
`docs/EXTENDING.md`; step-by-step for the two data-only points: `docs/guides/`.

| To add | Touch | Don't touch |
|---|---|---|
| A new action | `shared/packs/<id>.json` + one line in `shared/packs/index.ts` | engine, validator, RPC, settings, UI |
| A new output language | `shared/languages/<id>.json` + one line in `shared/languages/index.ts` | wrapper, handler, settings, UI |
| A new API protocol | `server/transports/api/<protocol>.ts` + `PROTOCOLS` + `API_PROTOCOL_IDS` | resolver, engine |
| A new CLI family | `server/transports/cli/family.ts` + `CLI_FAMILY_IDS` | resolver, engine |
| A new settings field | `shared/settings.ts` + a section under `client/settings/sections/` + `readiness/validation` if it affects the run path | other sections |

---

## 9. Invariants to keep when editing

1. Never auto-send; only replace Composer text while the snapshot still matches and the pill is
   still active.
2. Fail closed: a config/pack/transport error is a coded error; it never falls back to a
   different endpoint, model, or transport.
3. A prompt never enters `argv` or a log; a key never enters settings, logs, RPC, or an error
   message.
4. One registry, one schema version, one rewrite path. No separate branch for `coding`.
5. Client and server meet only through `shared/`; the server never imports `@getpaseo/client`.
</content>
