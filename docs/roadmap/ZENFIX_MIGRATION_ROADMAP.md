# ZenFix Migration Roadmap

**Status:** Active product execution roadmap
**Classification:** Product Validation Documentation
**Date:** 2026-07-12
**Owner:** Product and Engineering

This roadmap adds a Product Validation Checkpoint to the investment sequence.
It is not an Architecture override. The canonical Slice definitions, minimum
Gates, security boundaries, rollback rules, and live-money requirements remain
in the [Architecture Baseline](../architecture/ARCHITECTURE.md) and Accepted
[ADRs](../architecture/ADRs/README.md). Those normative documents govern any
conflict.

## 1. Current position

| Milestone | Status |
| --- | --- |
| Architecture Baseline | Accepted |
| Slice 1 — Test Safety Net | Complete at commit `d7a2276` |
| Slice 2 — Canonical Domain | Next technical Slice |
| Hosted Sandbox Physical-Isolation Gate | Not passed |
| Live funds | Prohibited |
| Product Validation Checkpoint | Defined here; not yet run |

The only primary repository remains `intent-swap`, using Incremental Strangler
Migration. Legacy and ZenFix surfaces may coexist during migration, but no
parallel ZenFix application or alternate execution lifecycle is introduced.

## 2. Revised investment sequence

```text
Architecture Baseline
        |
Slice 1 — Test Safety Net (complete)
        |
Slice 2 — Canonical Domain
        |
Slice 3 — Project-scoped Storage
        |
Slice 4 — Sandbox Control Loop
        |
Product Validation Checkpoint
        |
        +-- Pass ----------------------> consider Slices 5-10
        +-- Understandable, no intent -> refine ICP/onboarding; pause
        +-- Explanation failure ------> simplify explanation; pause
        +-- Trust failure ------------> revalidate Proof/Ledger value; pause
        +-- Burden failure -----------> reduce minimum Policy setup; pause
        +-- Design-partner failure ---> refine problem/ICP; pause
        +-- Sandbox safety confusion -> cannot pass; simplify and rerun
```

This does not remove or renumber any canonical Slice. The Product Validation
Checkpoint is a roadmap-local product decision between Slice 4 and continued
investment in Slices 5-10.

## 3. Slice 2 — Canonical Domain with minimal implementation focus

Slice 2 remains the canonical Architecture Slice. Its existing Gate still
requires domain and transition tests proving that the lifecycle cannot be
bypassed.

The first implementation focus is the smallest set of concrete objects needed
for the pilot:

- `PayIntent`
- `PolicyDecision`
- `FundingPreparation`
- `PaymentExecution`
- `ExecutionProof`
- `PayRun`
- `AuditEvent`

`ApprovalRequest` and Approval-related state-machine semantics are defined only
as required by the canonical transition model. Slice 2 does not implement an
Approval application workflow, Approval Queue, reviewer UI, or execution after
human approval.

“Minimal” narrows concrete product modeling; it does not shrink the canonical
Gate. Slice 2 must retain the minimum supporting contracts needed by the
Architecture, including:

- Project, Agent, Merchant, Policy, Money, and evidence references
- the complete canonical state and legal/illegal transition table
- Ledger boundary and completion precondition
- version/CAS and idempotency semantics used by transition tests
- append-only Audit and Domain Outbox transition semantics
- deterministic Policy and Approval-aware recheck semantics required by the
  state-machine Gate

Slice 2 must not over-model:

- public API keys or API-key management
- webhook endpoint or HTTP delivery behavior
- billing
- complex workspace or enterprise administration
- full Approval workflow
- real payment or funding rails

The Slice 2 read contract must support a future explanation that lets a user
answer within 60 seconds:

1. Why did the PayRun happen or stop?
2. Who was the intended Merchant/payee?
3. Which Policy version and checks decided?
4. How was Funding prepared?
5. What Payment and task Proof exists?

## 4. Slice 3 — Minimal project-scoped local storage

Slice 3 implements only the local storage needed for the Sandbox Control Loop,
while preserving the existing Storage Gate:

- every record and repository operation is project-scoped
- mutable aggregates use version and state compare-and-set
- each transition atomically writes the PayRun change, stage artifact,
  idempotency result, AuditEvent, and Domain OutboxEvent
- corrupt or unreadable state fails explicitly
- configured storage never silently falls back to demo or seed data

A fixed server-side Sandbox Project fixture may support the local pilot. It is
not public authentication, an API-key system, billing, or a complex workspace
model.

## 5. Required ADRs before Slice 4

The existing ADR register remains binding:

- ADR-0005 — budget reservation, Approval binding, and separation of duties —
  must be Accepted before Slice 4 Review/Funding implementation
- ADR-0006 — append-only Audit, balanced Ledger, and Receipt corrections — must
  be Accepted before Slice 4 Ledger implementation

This roadmap does not create or pre-approve those ADRs.

## 6. Slice 4 — Four-scenario Sandbox Control Loop

Slice 4 implements and tests the existing canonical fixtures:

- Allowed
- Review
- Blocked
- Funding mismatch

The Slice 4 Gate remains unchanged. It must prove the canonical state traces,
required and forbidden artifacts, Project isolation, CAS/idempotency behavior,
Audit/Domain Outbox writes, and absence of downstream effects for pending Review
and Blocked.

Funding mismatch uses only `sandbox_prepared` simulation evidence and then
continues the full Sandbox lifecycle. No real swap, bridge, transaction hash,
wallet signature, funding movement, or payment rail is permitted.

Research amounts and explanation requirements are defined in
[Pilot Scenarios](../product/PILOT_SCENARIOS.md).

## 7. Product Validation Checkpoint

After Slice 4 passes, implement one minimal read-only validation surface, for
example:

```text
/pilot-validation
```

This route is a roadmap-local Product Validation Checkpoint surface. It is not
the Slice 8 ZenFix UI, a Dashboard, a canonical Receipt system, or a new
Architecture Slice Gate.

The surface may:

- read four frozen PayRuns created by the real Sandbox Control Loop
- show `PayRunExplanation` through a receipt-style
  `ValidationReceiptProjection`
- display canonical state, Policy reason, Funding status, Payment evidence,
  task Proof, Ledger/current next action, and `SANDBOX / NO REAL FUNDS`
- use existing design assets only where needed for the study

The surface may not add:

- full navigation or an AppShell
- Settings
- API-key management
- a complete Approval Queue or approval action
- a Webhook Console
- public `/api/v1`
- billing or complex workspace controls
- animation or broad UI polish
- real Funding, wallet, swap, bridge, signer, or payment-rail capability

While the Hosted Sandbox Physical-Isolation Gate remains unpassed, the study is
local and moderated. Remote runtime access requires that independent Gate first.

Run the five-person study and apply the AND thresholds in the
[Pilot Validation Gate](../product/PILOT_VALIDATION_GATE.md) using the
[Trust Metrics](../product/TRUST_METRICS.md).

## 8. Conditional continuation after validation

A passing product checkpoint permits planning continued investment. It does not
pass the following technical Slices or waive their existing Gates:

| Slice | Unchanged technical deliverable |
| --- | --- |
| 5 | Approval concurrency, recheck, and one-execution guarantees |
| 6 | Project-scoped `/api/v1` authentication, schema, scope, and errors |
| 7 | Receipt/Webhook/Export with immutable versions and outbox delivery |
| 8 | Full ZenFix UI while the legacy root remains intact |
| 9 | Funding Layer Adapter with Sandbox default and no unsupported bridge claim |
| 10 | Product Surface/root cutover with rollback and legacy recovery evidence |

If the checkpoint fails, Slices 5-10 remain paused until every corresponding
product branch is addressed and the study is rerun. Multiple failed metrics
activate all matching branches; no strong metric cancels another failure or the
Sandbox safety veto. Infrastructure must not be built merely to compensate for
weak explanation, trust, integration intent, design-partner intent, or
Policy-configuration acceptance.

## 9. Gates that remain independent

The Product Validation Checkpoint never replaces:

- any canonical Slice Gate
- ADR-0005 through ADR-0011 prerequisites
- Hosted Sandbox Physical-Isolation Gate
- security and kill-switch requirements
- rollback and legacy retirement Gates
- Live Money Gate and a future accepted live-rail ADR
- the pre-launch UI Polish Gate

Passing product validation is one necessary product signal. It is not a claim
that ZenFix is Hosted, production-ready, or safe for real funds.

## 10. Product-validation document map

- [Initial ICP](../product/INITIAL_ICP.md)
- [Pilot scenarios](../product/PILOT_SCENARIOS.md)
- [Trust metrics](../product/TRUST_METRICS.md)
- [Pilot validation gate](../product/PILOT_VALIDATION_GATE.md)
