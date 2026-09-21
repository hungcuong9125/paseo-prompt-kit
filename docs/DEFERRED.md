# Deferred Register

Proposals and follow-ups ruled "not now". One row each; the Lead is the only
writer, the Human decides when a row is taken up. Never delete a row: change
its state. The ruling itself lives in `decision-log.md`; this file is the
index that keeps deferred items findable without reading the whole log.

Rules:

- Every `DEFER`/`DEFERRED` ruling in `decision-log.md` adds one row here with
  the next `DEF-nnn`; the DLF entry cites the `DEF-nnn`, not the description.
- Taking an item up is a new DLF that names the `DEF-nnn`; the row becomes
  `TAKEN_UP DLF-xxx`. Ruling it out for good: `DROPPED DLF-xxx`.
- `Revisit when` is an observable trigger (a decision made, a dependency
  landed, a date), never "later".
- `MEMORY.md` carries one line only: `Deferred: N open — docs/DEFERRED.md`.

| ID | Item | Deferred at | Source | Revisit when | State |
|---|---|---|---|---|---|
| DEF-000 | <one-line description of the deferred item> | YYYY-MM-DD | DLF-nnn / AIT id | <observable trigger> | OPEN |
