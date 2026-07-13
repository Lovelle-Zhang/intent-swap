# ADR-0005: Transactional Budget Reservation, Approval Binding, and Separation of Duties

**Status:** PROPOSED
**Date:** 2026-07-13
**Owner:** ZenFix Architecture, Domain, and Security

## 1. Status

This decision is **PROPOSED**. It does not authorize Slice 4 implementation, make the pull request Ready, or alter an Accepted Architecture decision. Human acceptance is required before Slice 4 implements Review/Funding behavior or Slice 5 relies on its Approval execution guarantees.

## 2. Context

The ADR register requires a decision for “budget reservation, Approval binding, and separation of duties” before Slice 4 Review/Funding implementation and the Slice 5 execution Gate.

The Accepted Architecture already requires:

- Approval only after `PolicyDecision=needs_review` and before Funding Preparation;
- an immutable Approval request bound to intent, Policy, Merchant, amount, target, rail, funding scope, covered reasons, and expiry;
- a fresh Approval-aware Policy evaluation before Funding;
- budget usage from Project-scoped Ledger data plus active reservations;
- atomic budget revalidation, reservation creation, aggregate CAS, FundingPreparation creation, AuditEvent append, and Domain Outbox append;
- authenticated requester, approver, and executor identities; and
- fail-closed behavior with no Funding artifact when a snapshot is stale or a conflict occurs.

The remaining decision is the concrete consistency boundary: what constitutes a reservation, when it becomes active/released/consumed, how Approval scope generations bind to it, which actor combinations are forbidden, and how retries, conflicts, expiry, cancellation, and recovery behave without adding PayRun states.

This ADR blocks the Slice 4 behavior `pending_review → approved → policy_evaluating → policy_allowed → funding_preparing` and the direct Allowed path at the atomic `policy_allowed → funding_preparing` boundary. It also establishes the concurrency contract that Slice 5 must later exercise through a complete Approval application workflow.

## 3. Decision drivers

- Prevent two individually eligible PayRuns from overspending the same Project, Agent, Merchant, rail, or time-window limit.
- Prevent an Approval from authorizing a different intent, Policy, reason set, quote, rail, funding plan, or execution scope.
- Prevent self-approval and client-selected reviewer identity.
- Keep Policy evaluation deterministic and side-effect free.
- Preserve the canonical PayRun state graph without adding reservation states to it.
- Make every conflict and recovery path observable through Audit and Domain Outbox records.
- Fit the single-store Local Development Sandbox while retaining a direct migration path to transactional Hosted/Postgres persistence.
- Avoid claiming that a Sandbox reservation proves custody, liquidity, settlement, or real funds.

## 4. Options considered

| Option | Correctness and consistency | Concurrency and idempotency | Failure recovery and auditability | Slice 4 complexity | Hosted/Postgres migration |
| --- | --- | --- | --- | --- | --- |
| **A. Separate transactional `BudgetReservation` aggregate, immutable Approval scope, authenticated role separation** | Strong: reservation is authoritative, Approval is scope-bound, and PayRun remains lifecycle authority | Strong: Project-scoped uniqueness plus CAS; stale conflicts fail and re-evaluate | Strong: explicit lifecycle, reasoned release/consume, Audit and Outbox in the same Unit of Work | Moderate and bounded | Direct mapping to rows, unique constraints, and transactions |
| **B. Embed budget counters/reservation fields and an `approved` flag inside mutable PayRun JSON** | Weak: budget truth is fragmented and Approval scope can drift | Weak: aggregate-local CAS cannot protect a shared budget across PayRuns | Weak: overwritten history and difficult release diagnosis | Initially low, then high under concurrency | High-cost redesign and data extraction |
| **C. Make an external append-only budget service/event stream the reservation authority** | Potentially strong with mature distributed design | Strong only with cross-service idempotency and ordering | Strong eventual history, but ambiguous cross-service partial failure without a transactional protocol | Excessive for Slice 4 | Useful at large scale, but premature and not aligned with the current single Unit of Work |

Option B is not recommended because it contradicts the Architecture requirement that budget usage comes from Ledger plus active reservations and cannot prevent cross-PayRun lost updates. Option C is not recommended for Slice 4 because it introduces a distributed transaction boundary, availability dependency, and recovery protocol not required by the current Architecture.

## 5. Recommended decision

Adopt **Option A**.

Introduce a Project-scoped `BudgetReservation` mutable aggregate coordinated with PayRun, Approval, FundingPreparation, IdempotencyRecord, AuditEvent, and Domain OutboxEvent through one Unit of Work. The reservation has its own monotonic version and a lifecycle of `active`, `released`, or `consumed`; these are reservation statuses, not new PayRun states.

An Approval consists of an immutable request and at most one final decision. It authorizes only its immutable `approvalScopeDigest` and covered review reasons. A fresh Policy evaluation must still return `allowed`, with the Approval decision as its authorization basis, before a reservation can be created.

The authenticated requester and approver must be different subjects. Only an authenticated human subject with the Project/Policy-defined approval capability may approve or deny. Worker/service executors cannot approve, and request bodies cannot select or impersonate any actor. A Sandbox fixture uses distinct deterministic subjects so the rule is exercised without introducing a public identity system.

## 6. Detailed semantics

### 6.1 Budget reservation contract

A reservation records at least:

- `id`, `projectId`, `payRunId`, `version`, and `status`;
- `scopeGeneration`, `policyDecisionId`, Policy version/checksum, and evaluation digest;
- immutable intent, Approval scope, and Funding plan/scope digests;
- optional `approvalDecisionId` for an Approval-backed allow;
- the Policy budget keys affected, such as Project, Agent, Merchant, rail, and time window;
- normalized reserved exposure in the Policy settlement unit as canonical integer atomic strings, including conservatively rounded fee exposure where the Policy counts fees;
- environment, creation time, expiry, and last transition time; and
- release or consumption reason/evidence when terminal.

`UNIQUE(projectId, payRunId, scopeGeneration)` identifies one logical reservation. A deterministic reservation command/request hash distinguishes a replay from an incompatible reuse. A new immutable scope requires a new scope generation after the prior reservation has been safely released; it cannot mutate an active reservation into a different amount or plan.

Only `active` reservations count with committed Ledger usage during Policy budget evaluation. `released` means authoritative evidence proves no reserved exposure remains. `consumed` means a balanced Ledger journal now represents the exposure; consumption and Ledger completion commit atomically so usage is never temporarily absent or double-counted.

### 6.2 Approval binding

The Approval request binds the exact fields already required by the Domain Model and state machine:

- Project and PayRun;
- intent digest;
- Policy ID, version, checksum, and evaluation digest;
- Merchant/payee, amount, settlement target, rail, and funding plan scope;
- covered review reason codes; and
- expiry.

`createdAtPayRunVersion` remains audit metadata. Normal PayRun version advancement does not invalidate an Approval. A change to any bound field, a changed reason set, or expiry invalidates the scope and requires a new Approval request. One active request exists per PayRun and scope generation, and one request receives at most one final decision.

An Approval-aware Policy recheck consumes only unchanged covered review reasons. A hard block wins. A new review reason creates a new request. No Approval can override kill switch, missing execution scope, unsupported environment, blocked Merchant/payee/category, absolute hard limit, invalid/expired intent, or unverified settlement configuration.

### 6.3 Separation of duties

The application derives all actors from authenticated context and records actor type, subject ID, Project, and effective capabilities.

- The requester/Agent may propose spend but cannot approve its own Approval request.
- The approver must be a distinct authenticated human subject eligible under the immutable Project/Policy snapshot used by the decision.
- A worker/service executor may claim prepared attempts but cannot create a human ApprovalDecision.
- Actor IDs in a body, query, route, or custom header are untrusted and cannot override server context.
- Eligibility failure, missing identity, or identity ambiguity fails closed without changing Approval, reservation, or PayRun state.

This is the minimum control for Sandbox and future Hosted modes. Additional two-person authorization for enabling live execution and rail-specific custody remains governed by later ADRs and is not implied here.

### 6.4 Lifecycle effects

This ADR adds no PayRun state or transition.

- `pending_review` has a pending Approval and no reservation, FundingPreparation, PaymentExecution, or LedgerJournal.
- `approved` records the human decision but still has no reservation or FundingPreparation.
- `approved → policy_evaluating` performs the mandatory recheck.
- `policy_allowed → funding_preparing` creates the active reservation and FundingPreparation request atomically.
- Before any possible external effect, a legal `expired`, `cancelled`, or authoritative no-effect `failed` completion releases the reservation in the same Unit of Work.
- After a funding or payment submission becomes possible or ambiguous, the reservation remains active through reconciliation; it is not released merely because a timeout or kill switch occurred.
- `ledger_recording → completed` atomically commits the balanced Ledger journal and marks the reservation consumed.

### 6.5 Domain, repository, and application impact

The future implementation requires a `BudgetReservation` domain contract and runtime schema, a Project-scoped repository with get/insert/CAS operations, and access to active reservations by the exact Policy budget keys. It does not move lifecycle status out of PayRun or make Policy stateful.

The Unit of Work context must expose the reservation repository. Local JSON may store a dedicated collection in its single checksummed envelope; Hosted/Postgres must use Project-scoped rows, uniqueness, foreign keys, and transactional CAS. Neither adapter may silently initialize over corrupt or unsupported data.

## 7. Required invariants

1. No reservation exists before a current `PolicyDecision=allowed`.
2. An Approval-backed reservation references the exact final ApprovalDecision and scope digest used by the allowed recheck.
3. Pending, denied, expired, blocked, or uncovered-review paths create no reservation or FundingPreparation.
4. Each active reservation belongs to one Project, PayRun, environment, immutable scope generation, and normalized budget exposure.
5. Ledger usage plus active reservations is the authoritative budget input; Policy JSON does not contain mutable usage counters.
6. One logical PayRun/scope generation has at most one reservation, including under retries and concurrent adapter calls.
7. A reservation amount, budget key, or bound digest cannot change in place.
8. A reservation is released only with authoritative no-effect/safe-release evidence and a legal PayRun transition.
9. A submitted or ambiguous external attempt cannot cause reservation release until reconciliation establishes the safe or consumed outcome.
10. A completed PayRun has a consumed reservation and balanced Ledger journal; terminal safe no-effect paths have no active reservation.
11. Requester and approver are distinct authenticated subjects; executor/service subjects cannot approve.
12. CAS, validation, Audit, Outbox, or reservation failure produces no partial state or external effect.

## 8. Transaction / Unit of Work boundary

Entering Funding is one transaction:

```text
load current Project/Policy/Ledger usage/active reservations
→ validate current PayRun, Approval, quote, control, and expected versions
→ deterministic Policy recheck
→ insert active BudgetReservation
→ insert FundingPreparation(requested)
→ CAS PayRun to funding_preparing
→ complete IdempotencyRecord
→ append AuditEvent
→ append Domain OutboxEvent
→ commit once
```

Every predicate must match exactly one expected Project-scoped record. Any failure rolls back the whole operation. External funding work occurs only after this commit through the existing prepared-attempt/worker protocol.

Safe release commits reservation CAS, the legal PayRun/stage transition, idempotency result, AuditEvent, and OutboxEvent together. Consumption commits reservation CAS with the balanced LedgerJournal/entries and terminal PayRun CAS defined by ADR-0006.

## 9. Failure and recovery behavior

- A stale Policy, quote, budget, Project control, Approval, PayRun, or reservation version creates no Funding artifact. The application returns the stable conflict/fail-closed result and requires a fresh read and Policy evaluation.
- A reservation uniqueness race is treated as replay only when the canonical request hash and immutable scope match; otherwise it is a version/idempotency conflict.
- Dependency unavailability leaves the PayRun at its legal current state and creates no authorization or reservation.
- Expiry before Funding creates no reservation. Expiry after reservation but before possible external effect requires atomic safe release with expiry evidence.
- A timeout or process crash after a possible external submission keeps the reservation active while reconciliation queries the deterministic execution key/provider reference.
- Audit or Outbox append failure rolls back reservation and PayRun changes.
- Recovery never deletes a reservation to “unstick” a PayRun. It replays an idempotent command, reconciles the external attempt, or performs an explicit legal release/consume transition.

## 10. Idempotency / concurrency behavior

- Every reservation mutation is Project-scoped, versioned, state-checked, and idempotent.
- Identical command key plus identical request hash returns the committed result; the same key with a different hash conflicts.
- Concurrent approvals resolve to one final ApprovalDecision.
- Concurrent Funding entries re-evaluate against the same authoritative budget domain; at most one conflicting reservation set commits.
- The losing command receives a conflict, reloads usage/reservations, and re-runs Policy. It is never auto-allowed and never automatically retried across a human decision boundary.
- Reservation generation and PayRun aggregate version each advance exactly once per successful mutation and never on a failed Unit of Work.

## 11. Audit / Outbox / Ledger implications

Approval request creation, Approval decision, Approval-aware recheck, reservation activation, safe release, and consumption each produce structured Audit evidence with stable action/reason codes and authenticated actors. The Domain Outbox event for the originating canonical transition is committed in the same Unit of Work and retains stable identity under retries.

AuditEvent is explanation evidence, not budget usage. OutboxEvent is delivery infrastructure, not Approval or reservation authority. Ledger remains the authority for committed financial usage. The active reservation bridges the period before Ledger commit; atomic consumption transfers that usage representation without a gap.

## 12. Sandbox behavior

Slice 4 uses deterministic Project-scoped Sandbox budgets, reservations, actors, and isolated account/evidence namespaces. A Sandbox reservation proves only that the deterministic Sandbox control loop reserved simulated budget capacity. It does not prove custody, wallet balance, token allowance, liquidity, bridge completion, payment settlement, or real funds.

For the Allowed fixture, reservation-backed `FundingPreparation.status=not_required` is server-derived Sandbox evidence. For Funding mismatch, the reservation precedes `sandbox_prepared` simulation. Both retain `environment=sandbox`, `realFundsAvailable=false`, no real transaction hash, and `SANDBOX / NO REAL FUNDS` labeling.

Local JSON is Local Development Sandbox Persistence. Its single-process/multi-instance coordinator and single-writer lease may provide the required atomic Unit of Work for local tests, but it is not a production or multi-process transaction system.

## 13. Live-money limitations

This ADR does not enable real Funding, Payment, wallets, signers, bridges, settlement, or production execution. It does not prove production-grade budget durability merely because Local JSON tests pass.

Hosted/Postgres persistence must enforce Project scope, uniqueness, CAS, and transaction boundaries at the database layer. Live execution additionally requires accepted kill-switch, hosted persistence, credential custody, rail/finality/reconciliation, security review, and live-rail ADRs. Separation of duties for live authority may be stricter than this minimum and cannot be weakened by a Sandbox fixture.

## 14. Test obligations

Future implementation tests must map every public behavior above:

- exact Allowed, pending Review, approve/recheck, reject, Blocked, and Funding mismatch traces;
- pending/denied/blocked paths create no reservation or Funding artifact;
- immutable Approval digest fields and `createdAtPayRunVersion` metadata behavior;
- changed bound field, new reason, expired Approval, hard block, changed Policy/Merchant/quote/budget/kill switch;
- requester self-approval, service-actor approval, body-supplied reviewer, missing capability, and cross-Project identity rejection;
- two concurrent Approval decisions produce one terminal decision;
- two concurrent PayRuns competing for one budget cannot overspend;
- duplicate identical reservation command returns one reservation; mismatched reuse conflicts;
- stale expected PayRun, Approval, reservation, Project, or budget version creates no partial writes;
- safe release on legal pre-effect expiry/cancellation/failure and no release during unknown/ambiguous execution;
- reservation remains active through Payment/Proof and is consumed exactly with balanced Ledger completion;
- fault injection at reservation, FundingPreparation, PayRun CAS, idempotency, Audit, Outbox, and commit boundaries rolls back all writes;
- restart persistence and Project isolation in the Local JSON adapter; and
- Sandbox evidence never claims real funding, bridge, settlement, or funds.

## 15. Consequences

The design adds an explicit aggregate and repository, but makes budget concurrency reviewable and directly migratable to relational constraints. Approval remains independently auditable and cannot degrade into a mutable boolean. The application performs more CAS checks at Funding entry, which is intentional because stale decisions must fail closed.

Migration is additive. Local Sandbox store schema changes must be versioned and either explicitly migrated or rejected as unsupported; corrupt data is never overwritten with an empty store. Hosted schemas use expand/contract and preserve reservations and decisions. Rollback disables new intake/workers and returns to a compatible artifact; it never deletes active, released, or consumed records. An incompatible rollback is blocked until reservations are reconciled and a compatible reader exists.

## 16. Deferred work

- Complete Approval API, queue, reviewer UI, notification, and execution workflow in Slice 5 and later UI slices.
- Hosted/Postgres row constraints, isolation levels, and operational recovery under the hosted persistence ADR.
- Multi-process workers, distributed leases, and database-backed reservation contention.
- Live-mode role governance, MFA, two-person enablement, credential custody, and rail-specific authority.
- Refund, compensation, and real accounting treatment under the live-rail ADR.

## 17. Explicit non-goals

- Adding or renaming PayRun states.
- Implementing Slice 4, Slice 5, Approval UI/API, Funding, Payment, Ledger, or workers in this proposal.
- Treating Policy evaluation as a reservation side effect.
- Allowing client-provided reviewer, PolicyDecision, reservation, Funding evidence, or status.
- Building Local JSON into a multi-process or production database.
- Enabling real wallets, swaps, bridges, payment rails, or funds.
- Defining the live-money two-person authorization protocol.

## 18. Architecture source references

- [Architecture Baseline](../ARCHITECTURE.md): Sections 2, 5, 9, 10, 11, and 13.
- [Domain Model](../DOMAIN_MODEL.md): Sections 2, 6, 7, 9, 11, and 12.
- [PayRun State Machine](../PAYRUN_STATE_MACHINE.md): Sections 4–7, 10, and 11.
- [Policy Engine](../POLICY_ENGINE.md): Sections 1, 2, 6, 8, 10, and 12.
- [Funding Layer](../FUNDING_LAYER.md): Sections 1–4, 7, 8, 10, 11, and 13.
- [ADR-0002](./0002-payrun-lifecycle-only-execution-path.md): lifecycle and Approval recheck authority.
- [ADR-0003](./0003-sandbox-first-execution.md): Sandbox physical isolation and no-real-funds evidence.
- [ADR-0004](./0004-project-scope-cas-and-outbox.md): Project scope, CAS, Unit of Work, idempotency, Audit, and Outbox atomicity.
- [Pilot Scenarios](../../product/PILOT_SCENARIOS.md): exact Slice 4 Sandbox fixtures and forbidden claims.
- [Migration Roadmap](../../roadmap/ZENFIX_MIGRATION_ROADMAP.md): ADR prerequisite and Slice boundaries.
