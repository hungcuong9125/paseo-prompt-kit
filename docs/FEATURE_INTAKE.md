# Feature Intake

Choose the smallest lane that honestly covers blast radius, reversibility, uncertainty, and
proof weakness.

## Lanes

### Tiny

Local, low-risk, reversible, and directly verifiable. Patch directly and keep affected truth
current.

### Normal

Bounded owner and contract, local rollback, and an honest validation route. The task or issue may
carry acceptance; create no repository artifact unless truth or progress must survive the task.

### High-Risk

Material security, authorization, data, public-contract, migration, external-side-effect,
runtime-boundary, cross-platform, or performance impact; irreversible state; broad uncertainty;
weak proof; or restart/handoff. Use an [active ExecPlan](PLANS.md#required-content) before
implementation.

## Hard Gates

Treat work as high-risk when it includes:

- material authentication, authorization, privacy, audit, or secret-handling change;
- data loss, irreversible migration, deletion, retention, replay, or recovery behavior;
- money, credentials, user-visible delivery, or non-idempotent external side effects;
- coordinated current-contract replacement or development-state reset/rebuild;
- any request to add backward compatibility, fallback, dual-read/write, a shim, facade, legacy
  parser, read-time upgrade, migration path, or version branch—stop because policy forbids it;
- material runtime owner-boundary, concurrency, lifecycle, or ordering change;
- weakening proof that protects a real security, data, contract, or external-system claim.

A label alone does not force the lane. Material impact, irreversibility, uncertainty, or weak
proof does.

## Design Gate

Before implementation, resolve any choice that materially changes ownership, public behavior,
safety, compatibility, data consequences, or another expensive-to-reverse direction. Record
constraints, meaningful alternatives, the decision, and likely failure modes. Do not prescribe
files, symbols, pseudocode, or private control flow.

Human confirmation is required when the requested behavior, destructive scope, or proof weakening
remains materially ambiguous. Compatibility is not an implementation choice available through
ordinary intake.

## Intake Result

Be able to state, briefly:

```text
Lane: tiny | normal | high-risk
Reason: [material reason]
Owners: [canonical docs/contracts]
Plan: [active plan](exec-plans/active/) or none
AIT: initiative [reused <id> | new <id> | n/a] · epic [<id> | n/a] · task <id>
Validation: [claim-shaped evidence]
```
