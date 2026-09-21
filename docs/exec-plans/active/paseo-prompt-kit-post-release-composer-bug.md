# Fix visible Composer selection regression (post v0.1.0)

Packet ID: paseo-prompt-kit-post-release-composer-bug · AIT epic: pk-98Fqg · Intent: docs/intents/paseo-prompt-kit-post-release-composer-bug.md · Base: main @ 0db4c1c (code tree = v0.1.0, 94cfc8f3…)

## Outcome And Constraints

Pill press reaches the intended Composer without "PromptKit needs one visible Composer."; never rewrite a Composer not proven to belong to the pressed pill's agent; fail closed on ambiguity. v0.1.0 immutable; no push/tag by agents.

## Context And Ownership

`client/composer/web.ts` `locateField` requires exactly one visible `[data-testid="message-input-root"]`; the host can keep several mounted (tabs/panes/retained panels). The pill carries `workspaceId`/`agentId` (DLF-005) but the adapter has no target identity. Mechanism must be proven on the real 0.8.0 DOM.

## Direction And Work Units

| AIT | Scope | Write scope | Route |
|---|---|---|---|
| pk-98Fqg.1 | reproduce in host → scout DOM topology → bind pill to its Composer by a proven relation → regression test on the observed topology → live verify → gate | client/composer/**, client/pills/rewrite-runner.ts, client/pills/agent-pills.ts, tests/jsdom/**, tests/unit/** (new), artifacts/** | pi-peer/workbuddy/deepseek-v4.1-flash high + MultiZen |

Signals: DEPENDENCY_REQUEST if no safe mapping exists in 0.8.0 → Lead sends DECISION_REQUEST.

## Acceptance And Recovery

Before/after tree SHAs, repro log, regression red→green, gate log at final tree, live rows (pill press works; multi-pane/hidden do not rewrite the wrong Composer). Rollback: revert the fix commit.
