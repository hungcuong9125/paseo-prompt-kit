# Extending PromptKit — where to add, how to add

Read `docs/CORE.md` §2 first to know which module owns what. The two data-only extensions
(a new action, a new output language) have step-by-step guides in `docs/guides/`; this page
summarizes them and describes the extensions that need code, with templates in
`docs/templates/`. Every recipe ends with verification: `npm run gate` must be green and, for
client-side changes, `paseo plugin reload prompt-kit` then open the Settings screen.

General rules (from `AGENTS.md`):

- One file, one responsibility, statable in one sentence without "and".
- No fallback, shim, dual-read, or version branch. Fail closed on error.
- Negative tests derive from current constants (`ACTION_ID_PATTERN`, `TIMEOUT_MS`,
  `MAX_INSTRUCTION_CHARS`), never naming something that was deleted.
- The only legal root directories are `client/`, `server/`, `shared/` — the host rejects any
  other root directory.

---

## 1. Add an Action (Action Pack)

Full guide: `docs/guides/action-packs.md`.

**Result:** a new entry in the pill menu, running through the same path as `general`, **no
TypeScript edits**. A personal action needs no file at all: Settings → Custom actions stores the
same JSON in settings.

1. Copy the template `docs/templates/action-pack.template.json` to `shared/packs/<id>.json`.
   `id` matches `^[a-z][a-z0-9-]*$` and matches the file name.
2. Fill in `title`, `description`, `icon` (a Lucide icon name, e.g. `Image`, `FileText`,
   `Search`).
3. Write `system` (what the action changes, and its rules) and `task` (a short paragraph
   stating the output clearly). **Do not** restate Core's rewrite contract
   (`shared/action-registry/rewrite-contract.ts`: author's voice, injection boundary, literals,
   language, output shape) and do not wrap `<task>` / `<draft>` yourself: Core prepends the
   contract and wraps and escapes the draft (`shared/action-registry/wrapper.ts`).
4. Add one line to `shared/packs/index.ts`:

   ```ts
   import image from "../packs/image.json";
   export const bundledPacks: readonly unknown[] = [general, image];
   ```

5. Verify:
   - `npm run gate` — `tests/unit/actions.test.ts` loads the real barrel; a schema-broken pack
     shows up in `listRejectedPacks()`.
   - `paseo plugin reload prompt-kit` then `paseo plugin logs prompt-kit`: no
     `action packs rejected` line.
   - Open Settings → the **Actions** section has a new switch; enabling two or more actions
     turns the pill into a menu.

Constraints: `system`/`task` ≤ 50,000 characters, `schemaVersion` = 1, `context.mode` =
`prompt-only`, `output.mode` = `replace-composer`. An unknown field ⇒ the pack is rejected
(strict schema).

---

## 1b. Add an output language

Full guide: `docs/guides/output-languages.md`. Summary: copy
`docs/templates/output-language.template.json` to `shared/languages/<id>.json`, add one line to
`shared/languages/index.ts`, `npm run gate`. Core inserts `instruction` into `<task>`; `source`
is the built-in default, with no file.

## 2. Add an API protocol

**Result:** a new endpoint kind selectable in Settings → API endpoint → Protocol.
(Only needed when the vendor does **not** speak the OpenAI, Anthropic, Gemini or Cloudflare shape. A new vendor
with the same shape is just a preset — see §5.)

1. Create `server/transports/api/<protocol>.ts` following
   `docs/templates/api-protocol.template.ts.md`. One module owns exactly three things: building
   the request, reading the answer, listing models.
2. Register it:
   - `shared/api-protocol.ts`: add the id to `API_PROTOCOL_IDS`.
   - `server/transports/api/runner.ts`: add it to `PROTOCOLS`.
   - `client/settings/api-endpoints.ts`: add it to `PROTOCOL_OPTIONS` (display label).
3. Test: add a `describe` block to `tests/unit/api-protocols.test.ts` following the pattern of
   the three existing protocols (correct request URL/header/body, parses the answer, parses the
   model list, an empty key ⇒ no header sent).
4. Add a preset for the vendor to `ENDPOINT_PRESETS`: `tests/unit/api-endpoints.test.ts`
   ("covers every protocol") fails until every protocol id has one. `server/transports/api/cloudflare.ts`
   is the most recent worked example.

---

## 3. Add a CLI family

**Result:** a provider that runs on a new CLI becomes reachable through the `cli` transport.

1. `shared/cli-families.ts`: add the id to `CLI_FAMILY_IDS`. This id is also the **binary
   name** and the string `resolveCliFamilyId` matches against the provider id (`<id>`,
   `<id>-*`, `*-<id>`).
2. `server/transports/cli/family.ts`: add a `CliFamily` following
   `docs/templates/cli-family.template.ts.md` and put it in the `FAMILIES` array. Required: the
   prompt goes through `stdin` or a file, **never** through `argv`; disable
   tools/context/session if the CLI has a flag for it; parse that CLI's exact JSON output
   format.
3. Test: `tests/unit/cli-family.test.ts` (no prompt in argv, correct flags, correct parser),
   `tests/server/harness.ts` → add a stdout sample for the new CLI to `stdoutFor()`.
4. Optional live probe: `npx tsx scripts/probe-cli.ts` with a cheap model (DLF-013).

Settings → Advanced → "CLI per provider" lists the new family automatically because it reads
`CLI_FAMILY_IDS`.

---

## 4. Add a settings field or a section

**Result:** a new field with a schema, a UI, pre-save validation, and (if it affects the run
path) a line in the status bar.

1. `shared/settings.ts`: add the field with a `.default(...)` so `{}` still parses. Don't
   change `version`.
2. If the field decides whether rewrite can run: update `client/settings/selection.ts` (shared
   with `rewrite-runner`) and `server/model-resolver/resolver.ts` — both sides must reject for
   the same reason.
3. UI:
   - A field that belongs to an existing section → add a row to that section.
   - A new group → create `client/settings/sections/<name>-section.tsx` following
     `docs/templates/settings-section.template.tsx.md`, then mount it in
     `settings-screen.tsx` at the right spot in reading order (Actions → Rewrite engine →
     dependent section → Advanced).
   - A section shows only when it's meaningful: condition on `values.transport` /
     `values.modelMode` in `settings-screen.tsx`.
4. A value with bounds → `client/settings/validation.ts` (`findSaveProblem`) so Save is blocked
   with a clear sentence, instead of a schema error from the host.
5. Test: `tests/unit/settings.test.ts` (default + bounds), `tests/unit/settings-validation.test.ts`,
   `tests/jsdom/settings-screen.test.tsx` (row shows at the right time, Save sends the right
   value).
6. README §Settings: one line for the new field.

UI primitives: use the host kit (`SettingsSection/Card/Row/Switch/Select/Input/Action`) for
every row; `client/settings/ui/` holds only `Button`, `Notice`, `StatusBar` for what sits
outside a row. Don't add a bare `Text` to a section — put the words in a row's `hint`/`error` or a
section's `info`.

---

## 5. Add a preset endpoint (no new code)

`client/settings/api-endpoints.ts` → `ENDPOINT_PRESETS`: id, label, protocol, base URL, default
key variable name, a short note. `tests/unit/api-endpoints.test.ts` already checks that every
preset parses and every id is unique.

---

## 6. Checklist before committing

- [ ] `npm run gate` is green (typecheck + unit + jsdom + host-load).
- [ ] `bash framework/tools/file-size-audit.sh`: no file exceeds its band without a reason.
- [ ] No deleted identifier/literal left over in code, tests, or fixtures (`git diff` to check).
- [ ] Client-side change: ran `paseo plugin reload prompt-kit` and opened Settings/the pill on a
      real host.
- [ ] README updated if user-visible behavior changed.
</content>
