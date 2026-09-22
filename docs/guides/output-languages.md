# Add an output language

Settings → **Rewrite engine → Output language** decides the language of the prompt after it's
rewritten:

- **Same as the prompt** (default): keeps the language you wrote in. Nothing extra is inserted.
- **English**, **Tiếng Việt**, …: the prose is translated into that language; paths, commands,
  code, and model/tool names stay exactly as written (the validator still checks).

Each language is **one JSON file** under `shared/languages/`. Core loads it, validates it, and
when you select it, inserts its `instruction` sentence into the `<task>` block sent to the
model. Adding a language **needs no TypeScript changes**.

## Step 1 — Create the file from the template

```bash
cp docs/templates/output-language.template.json shared/languages/ja.json
```

## Step 2 — Fill in the fields

| Field | Meaning | Constraint |
|---|---|---|
| `schemaVersion` | always `1` | |
| `id` | the value stored in settings `outputLanguage` | `^[a-z][a-z0-9-]*$`, unique, must not be `source` |
| `label` | display name in the select | ≤ 80 characters; writing it in that language itself reads clearest |
| `instruction` | the sentence Core sends to the model, **written in English** | ≤ 2,000 characters |

Example `shared/languages/ja.json`:

```json
{
  "schemaVersion": 1,
  "id": "ja",
  "label": "日本語",
  "instruction": "Write the rewritten prompt in Japanese. Translate the user's prose; keep every technical literal (paths, URLs, commands, code, identifiers, model and tool names) exactly as written."
}
```

Keep the "keep every technical literal …" clause in `instruction`: if the model translates a
file name or a command too, the validator rejects the rewrite for a lost protected literal.

## Step 3 — Register it in the barrel

`shared/languages/index.ts`:

```ts
import en from "../languages/en.json";
import vi from "../languages/vi.json";
import ja from "../languages/ja.json";

export const bundledLanguages: readonly unknown[] = [en, vi, ja];
```

The array's order is the select's order (after "Same as the prompt").

## Step 4 — Verify

```bash
npm run gate                      # tests/unit/languages.test.ts loads the real barrel
paseo plugin reload prompt-kit
paseo plugin logs prompt-kit      # must NOT show an "output languages rejected" line
```

Open Settings → Rewrite engine → Output language: a new entry appears. Select it, Save, then
press the pill in a Composer that has a prompt: the result must be in that language with every
literal intact.

## How Core uses a language (for understanding, no edits needed)

- `shared/language-registry/` loads the barrel and exposes `resolveLanguage(id)`: `source` ⇒
  inserts nothing; a loaded id ⇒ its `instruction`; an unknown id ⇒ the rewrite is rejected
  (`invalid_selection`).
- `shared/action-registry/wrapper.ts` inserts `Output language: <instruction>` **inside**
  `<task>`, never inside `<draft>`, so the draft can never forge it.
- Core's rewrite contract (`shared/action-registry/rewrite-contract.ts`) tells every action to
  keep the draft's language unless the task names an output language; packs don't repeat it.
- Write `instruction` about "the message" and "the author", never "the user": a translation
  must stay in the author's own voice.
- If settings hold an id that's no longer loaded (you deleted the file), the status bar reports
  *No output language is loaded with the id "…"* and rewrite is blocked until you pick another
  one.
</content>
