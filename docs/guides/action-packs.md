# Add a prompt option (Action Pack)

An Action is one entry in the PromptKit pill's menu, e.g. "Improve prompt". Each Action
is **one JSON file** under `shared/packs/`. Core loads, validates, and runs it through the exact
same path as the built-in `general` and `brief` actions; you don't touch the engine, validator, RPC, or UI.

## Step 1 — Create the file from the template

```bash
cp docs/templates/action-pack.template.json shared/packs/image.json
```

Naming rule: `id` matches `^[a-z][a-z0-9-]*$` and **matches the file name**
(`image.json` ⇒ `"id": "image"`).

## Step 2 — Fill in the fields

| Field | Meaning | Notes |
|---|---|---|
| `schemaVersion` | always `1` | any other value ⇒ the pack is rejected |
| `id` | the action's id, used in settings `actionEnabled` | unique; a duplicate id rejects both packs |
| `version` | positive integer, display/log only | bump it when the prompt changes |
| `enabledByDefault` | on by default or not | the user changes this in Settings → Actions |
| `title` | name in the pill menu and Settings | short, verb-first: "Improve image prompt" |
| `description` | one sentence under the switch in Settings | |
| `icon` | a Lucide icon name (`Image`, `FileText`, `Search`, `Sparkles`) | a wrong name ⇒ blank icon, no error |
| `context.mode` | `"prompt-only"` | the only value this build accepts |
| `output.mode` | `"replace-composer"` | the only value this build accepts |
| `system` | what this action changes, and its rules | ≤ 50,000 characters; Core's contract comes first |
| `task` | a short instruction stating the output | ≤ 50,000 characters |

Example `shared/packs/image.json`:

```json
{
  "schemaVersion": 1,
  "id": "image",
  "version": 1,
  "enabledByDefault": false,
  "title": "Improve image prompt",
  "description": "Rewrite the draft as a prompt for an image model.",
  "icon": "Image",
  "context": { "mode": "prompt-only" },
  "output": { "mode": "replace-composer" },
  "system": "Action: rewrite the draft as a prompt for an image generation model.\n\nRules:\n- Do not add subjects, styles or constraints the draft does not ask for.\n- Keep every literal (names, numbers, aspect ratios, file names) exactly as written.",
  "task": "Rewrite the draft below for an image model: subject, composition, lighting, style, then constraints. Output the rewritten message and nothing else."
}
```

## Step 3 — Register it in the barrel

`shared/packs/index.ts`:

```ts
import general from "../packs/general.json";
import brief from "../packs/brief.json";
import image from "../packs/image.json";

export const bundledPacks: readonly unknown[] = [general, brief, image];
```

The array's order is the menu's order and Settings' order.

## What Core does for you (don't redo it in the pack)

- Puts its rewrite contract (`shared/action-registry/rewrite-contract.ts`) ahead of your
  `system`. The contract fixes the voice: the output is sent as the author's own words, so it
  keeps the author's first person, speaks to the agent directly, and never narrates "the user".
  It also carries the injection boundary, the no-tools rule, literal preservation, the language
  rule, and the "return only the message" rule. Don't restate any of it; in `system`, never
  call the author "the user" either, or the model starts writing about them.
- Wraps `task` and the author's draft in `<task>` / `<draft>` and escapes fake delimiter
  characters.
- Inserts an `Output language: …` line into `<task>` when the user picks an output language
  (see [output-languages.md](output-languages.md)).
- Checks protected literals (paths, URLs, commands, code, model/tool names) — losing a literal
  rejects the rewrite, regardless of what the pack says.
- Rejects an answer that has a preface, a refusal, commentary, or wraps the whole reply in a
  code fence.

## Step 4 — Verify

```bash
npm run gate                      # tests/unit/actions.test.ts loads the real barrel
paseo plugin reload prompt-kit
paseo plugin logs prompt-kit      # must NOT show an "action packs rejected" line
```

Open Settings → **Actions**: a new switch appears. Enabling two or more actions turns the pill
into a menu. Changes to Actions reach the pill when the agent reopens or the plugin reloads.

## When a pack doesn't show up

`paseo plugin logs prompt-kit` logs `action packs rejected packs=<id or #index>`. Common
causes: `id` has an uppercase letter or a `_`, `schemaVersion` isn't 1, an extra field outside
the schema, a missing barrel line, two packs sharing an `id`. There's no fallback: a broken pack
is simply absent, the others keep running.
</content>
