# Intent brief

The Lead's charter, one per batch, written once the Human's intent is settled
and handed to the Lead verbatim in its initial prompt. The Lead commits it as
`docs/intents/<id>.md` in the packet-open evidence commit and cites that SHA
in every dispatch. It states what and why; it never states
how. An implementation sketch, a file list, or a task order is a defect here.
So is room procedure: reporting moments, review rounds, heartbeats, polling
rules, and routing tables live in the seat contracts and
`WORKSPACE_PROTOCOL.md`, never in a brief. A decision the Human has actually
made about the product is a locked decision and belongs here.

```text
Intent id:            <slug or ticket> — <short title>
Repository:           <root path> · <branch or worktree if the Human fixed one>
Report to:            <PASEO_AGENT_ID of the seat that sends this brief>
Outcome:              <what is true for the user or system when this is done;
                       observable, not a solution shape>
Why now:              <the reason this matters and what it unblocks>
Non-goals:            <what this batch deliberately does not do>
Locked decisions:     <decisions the Human has made, each with its reason;
                       "Human override: <model> <thinking>" for any route
                       departing from framework/provider-routing.md>
Invariants:           <what must stay true across every change: data,
                       contracts, security, compatibility, performance>
Acceptance checks:    <each an observable check that fails if the outcome or
                       an invariant is missing; every review lane scores
                       against these and nothing else>
Open questions:       <what the Human has not decided; the Lead sends a
                       DECISION_REQUEST when one blocks, never guesses>
Constraints:          <deadline, budget, external side effects allowed,
                       forbidden paths; when the project has work in
                       flight: "read framework/runbooks/lead-adoption.md
                       before the first dispatch">
```

A Lead that finds the brief's assumptions false against the source reopens
the brief with `REOPEN_REQUEST` to the `Report to` seat, as a
`DECISION_REQUEST`-class report; it does not quietly plan around them. A
decision bound outside the brief goes up as a five-line `DECISION_NOTICE`
while the Lead continues. Nothing else goes up before closeout.
