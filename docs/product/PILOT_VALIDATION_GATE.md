# ZenFix Pilot Validation Gate

**Status:** Active product validation checkpoint definition
**Classification:** Product Validation Documentation
**Date:** 2026-07-12
**Owner:** Product

This document defines a product-investment decision. It does not override the
[Architecture Slice and Gate model](../architecture/ARCHITECTURE.md), the
Hosted Sandbox Physical-Isolation Gate, the Live Money Gate, the canonical
state machine, or any Accepted ADR.

## 1. Decision question

The Product Validation Checkpoint answers one question:

> Is there enough product evidence to justify continued investment in Slices
> 5-10?

It is not:

- an Architecture Gate
- a Slice Gate
- a Security or Hosted Sandbox Gate
- a Live Money Gate
- approval to deploy publicly
- approval to skip, merge, or weaken any later Slice

## 2. Position in the roadmap

The checkpoint runs after the canonical Slice 4 Sandbox Control Loop has passed
its existing technical Gate and after the minimal read-only validation surface
is available.

```text
Slice 4 technical Gate
-> read-only Product Validation Checkpoint surface
-> five-person product study
-> continue, iterate, or stop infrastructure expansion
```

The authoritative technical sequence remains in the
[Architecture Baseline](../architecture/ARCHITECTURE.md). This checkpoint adds
a product evidence stop; it does not add a canonical state or replace a Gate.

## 3. Entry requirements

The study cannot begin until all of the following are true:

1. Slice 4 passes its existing Allowed, Review, Blocked, and Funding mismatch
   technical fixtures, including required Audit and Domain Outbox evidence.
2. ADR-0005 is Accepted before Slice 4 Review/Funding implementation, and
   ADR-0006 is Accepted before Slice 4 Ledger implementation, as required by
   the [ADR register](../architecture/ADRs/README.md).
3. The four displayed PayRuns were produced by the real canonical Sandbox
   Control Loop and read from its project-scoped records. UI-local mocks cannot
   stand in for lifecycle execution.
4. Every page and research artifact is marked `SANDBOX / NO REAL FUNDS`.
5. The study is local and moderated while Hosted Sandbox physical isolation is
   unverified. Remote runtime access is permitted only after that independent
   Gate passes.
6. The four scenarios and the scoring rubric in
   [Pilot Scenarios](./PILOT_SCENARIOS.md) and
   [Trust Metrics](./TRUST_METRICS.md) are frozen before the first session.
7. The neutral task prompt and wallet/manual-log comparison are versioned and
   frozen before the first session.

## 4. Participant protocol

Recruit exactly five participants who match the
[Initial ICP](./INITIAL_ICP.md): Agent developers or responsible leads with a
concrete Agent workflow that may purchase an API, data, or tool service.

Each participant independently reviews all four scenarios. The facilitator may
read the same versioned neutral task prompt but must not:

- explain PayRun, Policy, Funding, Proof, Ledger, or Sandbox terminology
- identify the correct decision or reason
- point to the field containing the answer
- correct an answer before metrics are recorded
- describe ZenFix as production-ready or live-money capable

Every conceptual intervention records `scenarioId`, timestamp, and intervention
type. A coached scenario remains in the five-person denominator and is scored as
an independent-explanation failure; it is never discarded or converted to a
pass.

## 5. Success criteria

All five criteria are required. The checkpoint passes only when every row
passes.

| Criterion | Passing threshold |
| --- | --- |
| `time_to_explain_seconds` + `explanation_correct` | The same at least 4/5 participants independently pass Allowed, Needs Review, and Blocked; each of their three explanations is correct and completed within 60 seconds |
| `trust_vs_wallet_log` | At least 4/5 record a positive participant-level score against the frozen comparison |
| `sandbox_integration_intent` | At least 3/5 commit one concrete workflow, name its owner, and accept a follow-up within 14 days |
| `configuration_burden` | At least 4/5 rate the frozen minimum Policy configuration 1-3 on the defined five-point burden scale |
| `design_partner_intent` | At least 3/5 opt in to two further sessions within 30 days |

Scenario D Funding Mismatch is a non-compensable safety guardrail. No participant
may conclude that a real swap, bridge, payment rail, or funding movement
occurred. Any such conclusion blocks a checkpoint pass, even when all five
quantitative rows pass. The primary 60-second cohort calculation remains the
same four participants passing all three Allowed, Needs Review, and Blocked
explanations.

## 6. Decision rules

### Pass

When all five thresholds pass, Product may plan continued investment in Slices
5-10. Continuation is conditional: every existing Slice Gate, ADR prerequisite,
security control, rollback requirement, Hosted Sandbox Gate, and Live Money
Gate remains mandatory.

### Explanation passes; integration intent fails

Refine the ICP, onboarding proposition, and Sandbox integration path. Pause
infrastructure expansion; do not compensate by building the public API,
Webhook Console, or complete Dashboard first.

### Explanation fails

Simplify PayRun Explanation, Policy presentation, and the validation read
projection. Do not add display-only lifecycle states or weaken canonical
evidence requirements.

### Trust fails

Revalidate whether users value the distinction among Policy reason, Payment
evidence, ExecutionProof, and Ledger. Pause Slices 5-10 while that value is
unproven.

### Configuration burden fails

Reduce the minimum Policy setup required for the ICP and rerun the study. Do
not respond by hiding Policy or allowing direct execution.

### Design-partner intent fails

Treat the result as insufficient continuing-discovery evidence even if the
interface is understandable. Refine the problem and ICP before expanding
infrastructure.

When multiple criteria fail, apply every corresponding branch. A stronger
result in one metric never cancels a failed branch or the Scenario D safety
guardrail.

## 7. Evidence package

The checkpoint record contains:

- participant qualification against the ICP
- frozen scenario and Policy fixture versions
- neutral task-prompt version and frozen comparison version
- per-participant raw metric records
- explanation scoring rubric and evaluator result
- conceptual interventions with scenario, timestamp, and type
- wallet/manual-log comparison shown to the participant
- decision outcome and the failed threshold, when applicable

Research evidence is stored separately from PayRun financial records. It cannot
write or infer a canonical PayRun state, PolicyDecision, ExecutionProof,
Receipt, security-readiness result, or production-readiness result.

## 8. Explicit non-authority

Passing this checkpoint does not mean:

- Hosted Sandbox physical isolation has passed
- the system is production-ready
- real funds may be used
- Approval, `/api/v1`, webhook delivery, full ZenFix UI, Funding adapters, or
  root cutover are complete
- any Accepted ADR or Architecture invariant is superseded

Those decisions remain governed by the
[Architecture Baseline](../architecture/ARCHITECTURE.md) and Accepted ADRs.
