# ZenFix Slice 2 Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the existing Slice 2 canonical PayRun domain with the accepted Architecture Baseline using only the formal worktree as the implementation source.

**Architecture:** Preserve the existing Incremental Strangler boundary and canonical PayRun lifecycle. Reapply only requirements explicitly established by `docs/architecture/`, test each requirement before implementation, and keep infrastructure/adapters outside this slice.

**Tech Stack:** TypeScript, Vitest, Next.js 14, React 18.

## Global Constraints

- The only implementation source is `/Users/lovellezhang/intent-swap-zenfix-payrun`.
- Do not copy or overlay `temp-staging`, `src/features/payrun`, or any other directory wholesale.
- Do not modify legacy swap behavior, framework versions, UI, API routes, adapters, or deployment configuration.
- Do not add states or gates that are absent from the accepted Architecture Baseline.
- Use test-driven development: add or adjust a focused failing test before each implementation change.
- Slice 2 remains local Sandbox only and must not enable real funds.

---

## A. REQUIRED — Reapply Against the Formal Worktree

### 1. Policy snapshot deterministic derivation

- [ ] Replace caller-authored Policy check outcomes with checks deterministically derived from a server-built, project-scoped snapshot.
- [ ] Bind Project, Agent, Merchant, Policy version/checksum, immutable PayIntent, budgets, PaymentQuote, optional FundingPreflightQuote, settlement target, rail, actor scopes, environment, and current server time.
- [ ] Preserve documented rule precedence, stable reason ordering, hard-block precedence, deterministic replay, and fail-closed behavior for missing authoritative inputs.
- [ ] Keep budget reservation as an application/storage concern; Slice 2 defines eligibility semantics and contracts only.

Architecture authority:

- [POLICY_ENGINE.md §2 Inputs](../../architecture/POLICY_ENGINE.md#2-inputs)
- [POLICY_ENGINE.md §4 Rule precedence](../../architecture/POLICY_ENGINE.md#4-rule-precedence)
- [POLICY_ENGINE.md §6 Amounts, quotes, and budgets](../../architecture/POLICY_ENGINE.md#6-amounts-quotes-and-budgets)
- [POLICY_ENGINE.md §12 Policy Gate](../../architecture/POLICY_ENGINE.md#12-policy-gate)
- [DOMAIN_MODEL.md §6 PolicyDecision](../../architecture/DOMAIN_MODEL.md#6-policydecision)

### 2. FundingAttempt and ExecutionAttempt

- [ ] Represent Funding attempts as append-only entities with deterministic execution key, immutable plan digest, outcome, timestamp, and evidence when applicable.
- [ ] Enforce the existing append-only ExecutionAttempt contract without creating a second logical PaymentExecution.
- [ ] Preserve unknown/reconciliation semantics; do not convert ambiguity into failure or retry under a new execution identity.

Architecture authority:

- [DOMAIN_MODEL.md §2 Aggregate and artifact taxonomy](../../architecture/DOMAIN_MODEL.md#aggregate-and-artifact-taxonomy)
- [DOMAIN_MODEL.md §8 PaymentExecution and ExecutionProof](../../architecture/DOMAIN_MODEL.md#8-paymentexecution-and-executionproof)
- [PAYRUN_STATE_MACHINE.md §6 External effect model](../../architecture/PAYRUN_STATE_MACHINE.md#6-external-effect-model)
- [FUNDING_LAYER.md §3 FundingPreparation model](../../architecture/FUNDING_LAYER.md#3-fundingpreparation-model)
- [FUNDING_LAYER.md §11 Failure and reconciliation](../../architecture/FUNDING_LAYER.md#11-failure-and-reconciliation)

### 3. Aggregate identity and version

- [ ] Require every newly created mutable aggregate to start at version 1 in the PayRun Project.
- [ ] Require each aggregate update to retain project, ID, creation identity, and expected state while increasing version exactly once.
- [ ] Reject replacement, version rollback, non-safe integer versions, and last-write-wins behavior.

Architecture authority:

- [ARCHITECTURE.md §2 invariants 7–9](../../architecture/ARCHITECTURE.md#2-non-negotiable-architecture-invariants)
- [DOMAIN_MODEL.md §2 Aggregate and artifact taxonomy](../../architecture/DOMAIN_MODEL.md#aggregate-and-artifact-taxonomy)
- [DOMAIN_MODEL.md §12 invariant 8](../../architecture/DOMAIN_MODEL.md#12-domain-invariants)
- [ADR-0004 Decision](../../architecture/ADRs/0004-project-scope-cas-and-outbox.md#decision)

### 4. Immutable instruction

- [ ] Keep PayIntent, ApprovalRequest, Funding approved plan/scope, PaymentInstruction, deterministic execution key, and instruction hash immutable across retries and reconciliation.
- [ ] Require a new PayRun rather than mutating merchant, amount, settlement target, rail, plan scope, or instruction identity.

Architecture authority:

- [DOMAIN_MODEL.md §2 Aggregate and artifact taxonomy](../../architecture/DOMAIN_MODEL.md#aggregate-and-artifact-taxonomy)
- [DOMAIN_MODEL.md §5 PayIntent](../../architecture/DOMAIN_MODEL.md#5-payintent)
- [DOMAIN_MODEL.md §8 PaymentExecution and ExecutionProof](../../architecture/DOMAIN_MODEL.md#8-paymentexecution-and-executionproof)
- [PAYRUN_STATE_MACHINE.md §4 Normative transition table](../../architecture/PAYRUN_STATE_MACHINE.md#4-normative-transition-table)
- [PAYRUN_STATE_MACHINE.md §8 Terminal-state rules](../../architecture/PAYRUN_STATE_MACHINE.md#8-terminal-state-rules)

### 5. Cross-stage binding

- [ ] Bind FundingPreparation to the immutable intent digest, allowed PolicyDecision, approved scope, requested amount, and required target.
- [ ] Bind PaymentInstruction to the same merchant, amount, USDC/Base target, rail, FundingPreparation, and deterministic identity.
- [ ] Bind ExecutionProof to the PaymentExecution and required artifact request.
- [ ] Bind LedgerJournal and entries to PaymentExecution, ExecutionProof, environment, external reference, evidence hash, asset, and exact atomic value.

Architecture authority:

- [ARCHITECTURE.md §2 lifecycle invariants](../../architecture/ARCHITECTURE.md#2-non-negotiable-architecture-invariants)
- [DOMAIN_MODEL.md §7 FundingPreparation](../../architecture/DOMAIN_MODEL.md#7-fundingpreparation)
- [DOMAIN_MODEL.md §8 PaymentExecution and ExecutionProof](../../architecture/DOMAIN_MODEL.md#8-paymentexecution-and-executionproof)
- [DOMAIN_MODEL.md §10 Ledger, audit, and receipt](../../architecture/DOMAIN_MODEL.md#10-ledger-audit-and-receipt)
- [FUNDING_LAYER.md §3 Required data](../../architecture/FUNDING_LAYER.md#3-fundingpreparation-model)

### 6. Evidence domain isolation

- [ ] Keep Sandbox and future guarded evidence in distinct namespaces.
- [ ] Prevent Funding evidence, Payment evidence, ExecutionProof, no-transfer evidence, expiry evidence, and safe-release evidence from substituting for one another.
- [ ] Keep Sandbox evidence synthetic, explicitly labeled, and free of real transaction claims.

Architecture authority:

- [DOMAIN_MODEL.md §1 Modeling rules](../../architecture/DOMAIN_MODEL.md#1-modeling-rules)
- [DOMAIN_MODEL.md §4 EvidenceReference](../../architecture/DOMAIN_MODEL.md#evidencereference)
- [DOMAIN_MODEL.md §8 PaymentExecution and ExecutionProof](../../architecture/DOMAIN_MODEL.md#8-paymentexecution-and-executionproof)
- [FUNDING_LAYER.md §2 First-pilot semantics](../../architecture/FUNDING_LAYER.md#2-first-pilot-semantics)
- [ADR-0003 Decision](../../architecture/ADRs/0003-sandbox-first-execution.md#decision)

### 7. Audit and Domain Outbox lineage

- [ ] Enforce unique event identity, project/PayRun lineage, monotonic sequence, and matching before/after aggregate versions.
- [ ] Require Domain Outbox payload identity and aggregate version to match the canonical transition.
- [ ] Preserve append-only return values without freezing or mutating caller-owned inputs.

Architecture authority:

- [ARCHITECTURE.md §9 Consistency and delivery semantics](../../architecture/ARCHITECTURE.md#9-consistency-and-delivery-semantics)
- [DOMAIN_MODEL.md §12 invariants 9–10](../../architecture/DOMAIN_MODEL.md#12-domain-invariants)
- [ADR-0004 Decision and failure behavior](../../architecture/ADRs/0004-project-scope-cas-and-outbox.md)

### 8. Approval scope recheck

- [ ] Bind Approval to Project, PayRun, PayIntent, Policy ID/version/evaluation digest, merchant, amount, target, rail, funding scope, covered reasons, and expiry.
- [ ] After approval, require a fresh Policy evaluation that consumes only unchanged covered review reasons.
- [ ] Return to review for a new reason and block for any hard-block rule while retaining historical approved evidence.

Architecture authority:

- [ARCHITECTURE.md §2 invariant 2](../../architecture/ARCHITECTURE.md#2-non-negotiable-architecture-invariants)
- [DOMAIN_MODEL.md §6 PolicyDecision](../../architecture/DOMAIN_MODEL.md#6-policydecision)
- [DOMAIN_MODEL.md §9 Approval](../../architecture/DOMAIN_MODEL.md#9-approval)
- [PAYRUN_STATE_MACHINE.md §7 Approval path](../../architecture/PAYRUN_STATE_MACHINE.md#7-approval-path)
- [POLICY_ENGINE.md §8 Approval semantics](../../architecture/POLICY_ENGINE.md#8-approval-semantics)

### 9. Idempotency retention

- [ ] Carry an explicit server-authoritative retention boundary in command/idempotency contracts.
- [ ] Validate that retention extends beyond command time.
- [ ] Preserve project + command type + key + canonical request hash identity and reject conflicting reuse.

Architecture authority:

- [ARCHITECTURE.md §9 Consistency and delivery semantics](../../architecture/ARCHITECTURE.md#9-consistency-and-delivery-semantics)
- [DOMAIN_MODEL.md §4 IdempotencyKey](../../architecture/DOMAIN_MODEL.md#idempotencykey)
- [DOMAIN_MODEL.md §12 invariant 7](../../architecture/DOMAIN_MODEL.md#12-domain-invariants)
- [ADR-0004 Decision](../../architecture/ADRs/0004-project-scope-cas-and-outbox.md#decision)

## B. DEFERRED — Not Implemented in Slice 2

- **Storage adapter:** Slice 3; Slice 2 defines repository contracts only.
- **CAS persistence implementation:** Slice 3; Slice 2 validates versions and expected-version port signatures only.
- **Real Unit of Work:** Slice 3–4; Slice 2 defines the atomic operation boundary without an adapter.
- **Real budget reservation:** Slice 3–4 and the required future ADR-0005; Slice 2 evaluates eligibility only.
- **Real payment rail:** Future guarded adapter and live-money ADR; Sandbox remains the only enabled environment.
- **API:** Slice 6.
- **UI:** Slice 8 and later product-surface work.
- **Webhook delivery:** Slice 7; Slice 2 retains Domain Outbox event contracts only.

Architecture authority:

- [ARCHITECTURE.md §11 Slice and Gate model](../../architecture/ARCHITECTURE.md#11-slice-and-gate-model)
- [ADRs README — required future decisions](../../architecture/ADRs/README.md#required-decision-register)
- [ADR-0003 Sandbox-first execution](../../architecture/ADRs/0003-sandbox-first-execution.md)
- [ADR-0004 Domain Outbox boundary](../../architecture/ADRs/0004-project-scope-cas-and-outbox.md)

## C. DROP — Do Not Reapply

- **Incomplete temp-staging schemas:** do not copy the staging `schemas.ts`; rebuild runtime parsing against the final formal-worktree types.
- **`JSON.stringify` canonical comparison:** use explicit value-object comparison or canonical digests for bound scope and identity.
- **Undefined state extensions:** use only the states and legal edges in `PAYRUN_STATE_MACHINE.md`; do not invent convenience states.
- **Unsupported extra Production gates:** implement only the accepted Slice 2 Gate, Security/Hosted Sandbox boundaries already documented, and tests required by the Architecture Baseline.

Architecture authority:

- [PAYRUN_STATE_MACHINE.md §2 Canonical states](../../architecture/PAYRUN_STATE_MACHINE.md#2-canonical-states)
- [PAYRUN_STATE_MACHINE.md §3 Transition graph](../../architecture/PAYRUN_STATE_MACHINE.md#3-transition-graph)
- [PAYRUN_STATE_MACHINE.md §11 State-machine Gate](../../architecture/PAYRUN_STATE_MACHINE.md#11-state-machine-gate)
- [ARCHITECTURE.md §11 Slice and Gate model](../../architecture/ARCHITECTURE.md#11-slice-and-gate-model)

## Execution Boundary After Approval

- [ ] Reconcile one REQUIRED group at a time in the formal worktree.
- [ ] For each group: write a focused failing test, confirm the Red result, implement the minimum Architecture-mapped behavior, then run the focused test.
- [ ] After all nine REQUIRED groups: run lint, typecheck, full tests, build, and smoke.
- [ ] Do not begin Slice 3 or any deferred capability.
