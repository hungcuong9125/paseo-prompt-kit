# Module boundary policy

Where new code goes, and when an existing file stops being the right home for
it. Standing repo policy like `commit-policy.md`: Lead applies it at dispatch
and at acceptance, and attaches this path to any dispatch that adds
substantial behaviour to an existing file.

## The rule that decides

One file has one reason to change. Ask it of the target file before writing:

> State this file's responsibility in one sentence, without "and".

If the new behaviour does not fit that sentence, it does not belong in that
file — whatever the line count says. A 400-line file that owns HTTP decoding
*and* business rules *and* SQL is already wrong; an 800-line parser that owns
one grammar is not.

Split along an axis that has a name: a domain operation, a transport, a
persistence boundary, a lifecycle stage. Do not split along "there was too
much here".

**Name test.** If the extracted part takes a precise domain name
(`merge-contacts`, `export-artifact`, `stage-board`), extract it. If the best
name you can find is `utils`, `helpers`, `common`, `shared`, `misc`, `core`,
`part2`, or `<name>2`, you have not found a seam — leave the code where it is
and stop.

## Size bands

Line count is a signal to look, never a verdict and never a target. Measure
with `framework/tools/file-size-audit.sh`.

| lines | obligation |
|---|---|
| `<500` | none |
| `500–799` | run the one-sentence test before adding; extract if it fails |
| `800–1199` | add no unrelated behaviour; new responsibility goes to a new module |
| `>=1200` | the packet records a justification or a split plan before more code lands |

Exempt from the bands: tests, generated code, vendored and patched
dependencies, versioned SQL schema/migration files, fixtures and snapshots,
lockfiles. Split those when they mix unrelated behaviour or stop being
scannable, not on a number.

## Before adding code

1. Name the target file's responsibility in one sentence.
2. If the new behaviour does not fit it, find the module that already owns
   that responsibility.
3. If none exists, create one named after the responsibility.
4. Never grow a file because it is the file already open.

The failure mode this exists to stop is not "a big file". It is a module that
became the place things go.

## Anti-fragmentation

Fragmentation is the equal and opposite failure, and splitting to satisfy a
number produces it.

- Never create `foo_part_1`, `foo2`, `service-helper`, `x-common`.
- Do not create a directory of 20–60 line files that are always read and
  edited together — that is one module with extra imports.
- Do not open a standalone "split the big files" task. A split rides with the
  next change that touches the file, unless the file is actively blocking a
  dispatch — then it is that dispatch's first step, recorded as such.

## Frontend

Colocate by feature; use type-folders only for the shared tier.

- `features/<feature>/` owns its own components, hooks, and pure transforms.
- `<Feature>View.tsx` composes and routes. Panels, dialogs, table bodies,
  data-fetch hooks, and pure transforms are siblings in the feature folder,
  not nested inside the view.
- Top-level `components/`, `hooks/`, `utils/` hold only what two or more
  features actually use. Moving something there is a promotion, not a default.
- A pure transform (merge planning, price calculation, filter/sort) belongs in
  its own file and is unit-testable without rendering.

## Lead obligations

- **Dispatch** — when the assignment adds substantial behaviour to an existing
  file, attach this path and name the target file's responsibility as a locked
  decision. When the assignment creates a surface, name the module split you
  expect and say it is a floor, not a ceiling.
- **Handback** — the capsule names any touched file the change moved into a
  higher band, with the reason. That line is required; "no band change" is a
  valid value.
- **Acceptance** — run `framework/tools/file-size-audit.sh` at the candidate
  SHA. A band crossing without a stated reason is `FINDINGS`, not a blocker.
  A cohesive file over a band with a recorded reason passes.
