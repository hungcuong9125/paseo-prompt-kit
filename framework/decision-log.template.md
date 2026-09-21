# Decision Log

Durable cross-scope delivery decisions for this project. This file is
append-only. It is not a status page, not a task list, and not a transcript of
how a decision was reached — that belongs to the packet in
`docs/exec-plans/{active,proposed,done}/`.

Each locked decision gets its own evidence commit; evidence commits are
Lead-only and never combined with code commits.

## Current index

<!--
Keep only the most recent decisions here, newest first, one line each, so a
takeover never has to read the whole log. Trim older lines as they are
superseded; the full entry below is the durable record.
-->

- `DLF-000` — <one-line ruling> — <state>

## Entries

<!--
Copy this block for every new decision. Never edit an existing entry: a
reversal is a new entry that names the one it supersedes.
-->

### DLF-000 — <short title>

- Decided at:
- Decision owner:
- Packet ID / AIT issue ID:
- Commit SHA at decision:

**Production behavior.** What the system does after this decision. State the
observable behavior, not the intent.

**Evidence source.** The command, file locator, or runtime observation that
supports the decision, with its actual result.

**Reversal condition.** The concrete signal that would make this decision
wrong, and what happens then.

**Supersedes / superseded by.** `NONE`, or the decision ID.
