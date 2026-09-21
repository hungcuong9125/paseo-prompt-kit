# Development policy:

- Keep exactly one live contract and implementation path.
- Keep the protocol/schema version at 1 until the first public shipment. Replace Version 1 content instead of introducing v2 or v3.
- Breaking changes are mandatory when the current design changes; legacy versions are unsupported.
- Do not add dual-read, dual-write, version branches, shims, facades, adapters for old shapes, legacy parsers, read-time upgrades, migration behavior, or fallback implementations.
- Reset or rebuild development state. Do not add a migration path for old development data.
- Do not preserve old tests as authored truth. After a hard cut, negative cases must derive invalid data from current constants and boundaries rather than naming deleted fields, tags, widths, values, or versions.
- Use the diff to discover removed identifiers and literals, then remove them from current code, tests, and fixtures.
- Never commit a legacy blacklist, tombstone registry, or source-substring gate.
- Fail fast and fail closed. A failed current path does not activate alternate semantics.

## Code structure

- One file, one responsibility: state it in a sentence without "and". New behaviour that
  does not fit that sentence goes to the module that owns it, or to a new module named
  after it. Never grow a file because it is the file already open.
- Line count is a signal to look, never a target. `>=500` run the sentence test before
  adding; `>=800` add no unrelated behaviour; `>=1200` needs a recorded justification or
  split plan. Tests, generated, vendored, SQL schema, and fixtures are exempt.
- Never split to hit a number, and never create `utils2`, `x-common`, `foo_part_1`, or a
  directory of tiny files that are always edited together.
- Full policy and the audit command: `framework/module-boundaries.md`.

## Code Search

Use `semble search` to find code by describing what it does or naming a symbol/identifier, instead of grep:

```bash
semble search "authentication flow" ./my-project --max-snippet-lines 10  # first 10 lines only, concise
semble search "save_pretrained" ./my-project                          # full chunk content
semble search "save model to disk" ./my-project --top-k 10           # more results
```

The index is built on first run (and cached for subsequent runs) and invalidated automatically when files change.

Use `--content docs` to search documentation and prose, `--content config` for config files (yaml, toml, etc.), or `--content all` to search code, docs, and config:

```bash
semble search "deployment guide" ./my-project --content docs
semble search "database host port" ./my-project --content config
semble search "authentication" ./my-project --content all
```

Use `semble find-related` to discover code similar to a known location (pass `file_path` and `line` from a prior search result):

```bash
semble find-related src/auth.py 42 ./my-project
```

`path` defaults to the current directory when omitted; git URLs are accepted.

If `semble` is not on `$PATH`, use `uvx --from "semble[mcp]" semble` in its place.

### Workflow

1. Start with `semble search` to find relevant chunks. The index is built and cached automatically.
2. Use `--content docs` for documentation, `--content config` for config files, or `--content all` for everything.
3. Navigate directly to the returned file and line — do not re-search or grep for the same content.
4. Optionally use `semble find-related` with a promising result's `file_path` and `line` to discover related implementations.
5. Use grep only when you need every occurrence of a literal string across the whole repo (e.g., all callers of a renamed function).
6. Never read or search under `node_modules`, `dist`, `build`, `.git`, `__pycache__`, or vendored bundles unless the dispatch names a file there.

## Shell output filtering (optional, machine-local)

`rtk` (Rust Token Killer) is a token-optimizing proxy for shell commands. It is
a per-machine optimization, not part of the delivery contract.

When `which rtk` resolves, prefix shell commands with it — `rtk git status`,
`rtk cargo test`, `rtk pytest -q`. Use `rtk proxy <cmd>` to run a command
unfiltered when the raw output matters as evidence, and `rtk gain` for savings
analytics. When `rtk` is absent, run commands directly; do not install it and
do not treat its absence as a blocker.

Never record filtered output as verbatim evidence. Evidence that must be exact
— a SHA, a test summary, an error string — is captured from the unfiltered
command.