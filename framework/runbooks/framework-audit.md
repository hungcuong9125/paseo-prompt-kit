# Framework Audit Runbook

Use this runbook only when the target is the canonical Delivery Framework
itself. It is not the normal project Independent Review assignment.

## Required reading

Read `README.md`, `AGENTS.md`, `template/framework/protocol.md`, and
`template/WORKSPACE_PROTOCOL.md`, then read all files under
`template/framework/`, including profiles and runbooks.

## Boundary

This is a read-only audit. Do not edit files, create commits, push, change
runtime state, or record acceptance. Keep the review independent from any
preferred verdict. A Human task message may narrow the audit target, but it
cannot override the read-only boundary or evidence bar.

## Review focus

Check that the framework has one live contract, clear authority boundaries,
single-owner writable scopes, distinct candidate/review/verification/
acceptance states, portable project binding, provider-neutral profiles, and no
duplicate or hidden workflow. Record facts with file locators and commands.

Report `PASS`, `FINDINGS`, `BLOCKED`, or `REOPEN_REQUEST`. Missing evidence or
material `UNKNOWN` is never `PASS`. Do not implement a fix in this runbook.
