# ZenFix PayRun Domain Model

**Status:** Canonical baseline
**Date:** 2026-07-12

## 1. Modeling rules

- `PayRun` is the execution aggregate. No payment-related side effect exists outside a PayRun.
- Every entity and repository operation carries `projectId`.
- IDs are opaque, globally unique strings. Authorization never depends on obscurity of an ID.
- Timestamps are UTC ISO-8601 values supplied by an injected clock.
- Money is represented as integer atomic units plus asset, chain, and decimals. JavaScript floating-point numbers are not a source of truth.
- Mutable aggregates carry an integer `version` used for compare-and-set.
- Domain decisions use stable codes plus human-readable explanations.
- External references, checksums, and signatures are evidence; display labels are not evidence.
- Sandbox, test, and future live environments have separate identifiers, credentials, repositories, and evidence namespaces. Records are never promoted across environments.

## 2. Aggregate boundaries

### Project aggregate

Owns tenant-wide safety and configuration:

- identity and mode: `sandbox` or future `live_guarded`
- emergency kill switch
- default settlement policy
- API keys and allowed scopes
- active policy and merchant registry versions
- feature-gate state

Project scope is mandatory at the repository, application, API, audit, receipt, and webhook layers.

### PayRun aggregate

Owns one controlled spending attempt from intent through ledger:

```text
PayRun
├── PayIntent
├── PolicyDecision history
├── Approval reference, when required
├── FundingPreparation
├── PaymentExecution
├── ExecutionProof
├── AuditEvent references
├── LedgerJournal references
└── Receipt reference, after completion
```

The aggregate contains `id`, `projectId`, `version`, `status`, `creationIdempotencyKey`, `createdAt`, and `updatedAt`. Stage records are absent until their legal transition creates them; a client cannot pre-populate downstream results.

The tree describes lifecycle ownership and lineage, not one replaceable JSON document. Audit events, idempotency records, Ledger journals, Receipts, inbox records, and outbox records are persisted as independent append-only or constrained records and linked to the PayRun. They cannot be overwritten by saving the aggregate.

### Aggregate and artifact taxonomy

| Type | Kind and mutability | Concurrency / identity rule |
| --- | --- | --- |
| `Project` | mutable aggregate root | `UNIQUE(project_id)`, monotonic version CAS |
| `PayRun` | mutable lifecycle aggregate root | `UNIQUE(project_id,id)`, version/state CAS; sole owner of canonical PayRun state |
| `Approval` | mutable aggregate root coordinated with PayRun | version/status CAS; one final decision per request; one active request per PayRun and scope generation |
| `FundingPreparation` | mutable aggregate root coordinated with PayRun | version/status CAS; unique approved scope digest and generation |
| `PaymentExecution` | mutable aggregate root coordinated with PayRun | version/status CAS; one logical payment identity with immutable instruction hash |
| `LedgerJournal` | immutable accounting aggregate root | unique verified proof/external reference; entries commit with the journal |
| `Receipt` | immutable versioned document | unique Project + PayRun + receipt version; corrections append |
| `Policy` / `PolicyDecision` | immutable version / immutable evaluation artifact | version/checksum and input digest identify replay |
| `PayIntent`, `PaymentInstruction`, `ExecutionProof` | immutable stage artifacts | content digests and project-scoped IDs |
| `FundingAttempt`, `ExecutionAttempt` | append-only attempt entities owned by their stage aggregate | deterministic attempt/execution key; provider reference uniqueness |
| `AuditEvent`, `InboxEvent`, `OutboxEvent`, `IdempotencyRecord` | consistency infrastructure records | independent project-scoped uniqueness and append/transition constraints |

When one command changes multiple aggregate roots, all expected versions/states are checked and all changes commit in one Unit of Work. `PayRun` remains the only object allowed to expose lifecycle status; stage aggregate statuses cannot advance it implicitly.

## 3. Canonical domain objects

| Object | Purpose | Required production properties |
| --- | --- | --- |
| `Agent` | Actor authorized to request spend | project, owner, status, policy binding, capabilities |
| `Merchant` | Intended payee and trust classification | project, identity, category, trust state, settlement requirements |
| `Policy` | Versioned rules controlling spend | project, version, limits, allow/block rules, approval rules, artifact requirement |
| `PayIntent` | Immutable normalized request | source, agent, task, purpose, merchant, maximum, quote, target settlement, expiry |
| `PolicyDecision` | Explainable evaluation result | policy version, `allowed/needs_review/blocked`, checks, reason codes, risk, validity window |
| `Approval` | Human decision gate containing an immutable request and final decision | bound PayRun/intent/policy/scope digests, eligibility, expiry, authenticated reviewer decision |
| `FundingPreparation` | Evidence that required payment funding is ready or intentionally not required | action, source, required target, status, quote/reference, expiry, evidence |
| `PaymentExecution` | Payment rail attempt and settlement evidence | idempotency key, rail, amount, target, status, provider reference, reconciliation state |
| `ExecutionProof` | Proof of the paid task or artifact | provider, request reference, artifact type/location, checksum, verification status |
| `AuditEvent` | Immutable explanation of a transition or operator action | project, PayRun, sequence, actor, action code, detail, timestamp |
| `Ledger` | Project-scoped append-only accounting subsystem composed of `LedgerJournal` roots and `LedgerEntry` children | project, PayRun, journal, debit/credit entries, atomic units, evidence hash |
| `Receipt` | Versioned human-readable projection of a terminal PayRun | schema version, lifecycle summary, evidence references, checksum/signature |
| `WebhookEndpoint` | Project-scoped event destination | redacted secret metadata, event subscriptions, verification state |
| `OutboxEvent` | Immutable event committed with the originating transition | stable event ID, schema version, aggregate version, canonical payload |
| `WebhookDelivery` | Outbox delivery attempt | stable event ID, attempt, state, next retry, response metadata |

## 4. Value objects

### Money

```text
Money {
  amountAtomic: bigint-compatible decimal string
  asset: asset identifier
  settlementRef: LogicalSettlementTarget or OnChainAssetRef
  decimals: integer
}
```

Policy comparison normalizes values into the Policy settlement unit without losing the original quoted amount. Rounding mode is explicit and conservative for spend limits.

### SettlementTarget

The first Production Product target is:

```text
asset = USDC
chain = Base
```

The Policy resolves the final settlement target. A client or Funding adapter cannot override it. Source assets such as ETH or SOL describe funding input only.

For the first pilot:

```text
environment = sandbox
executionAdapter = sandbox_simulated
rolloutMode = sandbox_pilot
LogicalSettlementTarget = { chainFamily: base, asset: USDC, decimals: 6 }
```

It has no on-chain chain ID or token contract. Funding evidence uses `sandbox_funding_evidence`, payment evidence uses `sandbox_payment_evidence`, and neither may be named a Ledger entry or emit a synthetic mainnet transaction hash. A future chain adapter uses `OnChainAssetRef { chainId, contractAddress, decimals, configVersion }`; its Asset Registry must also pin provider and finality rule.

ETH used for Base gas is modeled as an execution fee resource. It never changes the final payment asset or inflates the USDC payment amount.

### IdempotencyKey

An idempotency record is scoped to `projectId + command type + key`. It stores request hash, `in_progress/completed/unknown` state, resulting resource ID, response status, and retention. Reusing the full scoped key with a different request hash is a conflict. Execution/payment keys remain reserved for at least the full reconciliation and financial-record retention period.

### EvidenceReference

External evidence records provider, reference, observed status, checksum, captured time, and verification method. A synthetic identifier must be labeled sandbox and never presented as independent settlement proof.

## 5. PayIntent

`PayIntent` is immutable after creation. Corrections create a new intent and a new PayRun.

Required semantics:

- `source`: API, SDK, simulator, workflow, or manual operator
- `agentId`, `taskId`, and human-readable purpose
- merchant identity and category
- maximum authorized Money and quoted Money
- expected artifact type
- requested funding source, if known
- Policy-resolved settlement target
- creation and expiry times

An LLM may propose normalized fields, but runtime schema validation and deterministic resolution create the canonical intent.

## 6. PolicyDecision

A decision records the evaluated Policy ID and version, input snapshot hash, stable checks, reason codes, risk level, outcome, `evaluatedAt`, and `validUntil`.

Outcomes:

- `allowed`: may enter Funding Preparation while the decision remains valid
- `needs_review`: creates an ApprovalRequest and pauses before Funding Preparation
- `blocked`: terminal; creates no FundingPreparation, PaymentExecution, or ExecutionProof

Approval creates a human decision event, not a permanent replacement for Policy. The application re-evaluates Policy against current spend, project state, merchant state, and expiry before proceeding. The recheck receives the immutable Approval decision ID, approved scope digest, and covered review reason codes. A still-valid approval satisfies only those same review reasons; a new review reason creates a new request, while any hard block terminates the path.

The ApprovalRequest binds the immutable intent digest, Policy version, merchant, amount, target asset/chain, rail, funding plan scope, covered reason codes, and expiry in an `approvalScopeDigest`. `createdAtPayRunVersion` is audit metadata only; normal state/version advancement does not invalidate Approval. Any bound-field change does invalidate it.

## 7. FundingPreparation

Every allowed PayRun records one FundingPreparation:

- `requested`: immutable approved scope is recorded before any preparation attempt
- `not_required`: server-side custody/reservation evidence proves the exact target asset, chain/control boundary, and atomic amount are already available
- `planned`: conversion or bridge steps are described but not executed
- `sandbox_prepared`: sandbox evidence shows the planned route for pilot purposes
- `prepared`: a future guarded adapter produced verifiable funding evidence
- `unsupported`: required capability does not exist
- `failed`: an attempted preparation failed
- `expired`: plan/evidence expired before Payment and safe release/no-ambiguous-effect evidence exists

Actions are `none`, `swap`, `bridge`, or `swap_and_bridge`. `unsupported`, `failed`, and `expired` cannot enter Payment. If a Funding attempt may have produced an external effect, it remains in reconciliation rather than becoming `expired`.

`not_required` is never accepted from a client assertion, wallet display balance, token symbol, or allowance. Sandbox uses a deterministic fixture/reservation; any future on-chain mode uses the environment registry plus authoritative custody/reservation evidence.

## 8. PaymentExecution and ExecutionProof

Payment and task execution are distinct evidence domains:

- `PaymentExecution` proves the merchant payment rail request and settlement outcome.
- `ExecutionProof` proves what the paid service or task returned.

Payment success alone does not complete a PayRun. The state machine must collect and verify the required ExecutionProof, then record the Ledger stage.

Submission, confirmation, proof, and ledger posting are distinct states. A transaction or provider reference alone is not ExecutionProof. An ambiguous timeout is represented as `unknown` and reconciled before retry or terminal status.

`PaymentExecution` statuses are:

```text
prepared → submitted → succeeded
                     ↘ unknown → succeeded
                               ↘ failed_no_transfer
          submitted → failed_no_transfer
```

Only authoritative evidence that no value moved may produce `failed_no_transfer`. `ExecutionAttempt` is append-only with `prepared`, `submitted`, `unknown`, `final_success`, or `final_failure` outcome; retries/replacements retain the logical PaymentExecution and deterministic execution key. PayRun mapping is exact: `submitted` stays `payment_executing`, `unknown` maps to `payment_unknown`, `succeeded` maps to `payment_succeeded`, and `failed_no_transfer` may map to terminal `failed`.

## 9. Approval

`Approval` consists of an immutable `ApprovalRequest` plus, at most, one terminal `ApprovalDecision`. Request states are `pending`, `approved`, `denied`, and `expired`; the decision records `approved` or `denied` separately from the Policy outcome.

An approval command supplies expected PayRun version and idempotency key. Reviewer identity comes from authenticated server context, never from the request body. The Unit of Work performs:

1. pending-state CAS
2. reviewer authorization
3. intent expiry check
4. Approval decision and PayRun CAS
5. audit, idempotency result, and webhook outbox append

The following continuation re-evaluates Policy with `PolicyRecheckContext`. Entering Funding atomically revalidates budget eligibility, creates the budget reservation, CAS-updates every affected aggregate, and records the transition. A concurrent reservation conflict causes re-read and re-evaluation, never an automatic allow.

Concurrent or retried approval commands must resolve to one recorded decision and at most one downstream execution.

## 10. Ledger, audit, and receipt

- Audit events explain who did what and why.
- Ledger journals record financial value movement in balanced debit and credit entries. Non-financial lifecycle facts belong in AuditEvent, not Ledger.
- Neither is rewritten to make history look cleaner.
- Receipt `v1` is an immutable persisted snapshot of committed PayRun, Ledger, payment evidence, and execution proof. A GET does not rebuild historical receipts from mutable current state.
- The receipt checksum covers its canonical payload. A future signature scheme adds a signature without changing the `v1` fields.
- Ledger journals are balanced in integer atomic units. Corrections append a reversal journal and a new Receipt version; they never update or delete settled history.

Minimum Ledger model:

```text
LedgerJournal {
  id, projectId, payRunId, paymentExecutionId, executionProofId,
  externalReference, environment, assetRef, createdAt, reversalOfJournalId?
}

LedgerEntry {
  id, journalId, accountId, debitAtomic, creditAtomic, evidenceHash
}
```

For every journal and asset, total debits equal total credits, each entry has exactly one non-zero side, amounts are non-negative integers, and the proof/external reference cannot post twice. A correction posts a full reversal linked to the original and then, if needed, a replacement journal. Sandbox journals use separate simulated accounts/environment and can never be exported as live settlement.

## 11. Repository contracts

Conceptual repository methods always include project scope:

```text
PayRunRepository.get(projectId, payRunId)
PayRunRepository.list(projectId, query)
PayRunRepository.insert(projectId, payRun)
PayRunRepository.compareAndSet(projectId, payRunId, expectedVersion, next)

ApprovalRepository.get(projectId, approvalId)
ApprovalRepository.transition(projectId, approvalId, expectedVersion, expectedStatus, next)

FundingPreparationRepository.compareAndSet(
  projectId, fundingPreparationId, expectedVersion, expectedStatus, next
)

PaymentExecutionRepository.compareAndSet(
  projectId, paymentExecutionId, expectedVersion, expectedStatus, next
)

UnitOfWork.execute(projectId, operation)
```

Every tenant-owned table has `project_id NOT NULL`, `UNIQUE(project_id,id)`, and project-scoped composite foreign keys. CAS updates include `project_id + id + expected_version + expected_state` and must affect exactly one row. Cross-project access returns not found and emits a security audit signal. A storage backend failure returns a backend error; it never reads from a different adapter.

Consistency infrastructure is also project-scoped: `IdempotencyRecord`, `InboxEvent`, `OutboxEvent`, and worker lease records have independent uniqueness constraints. They support delivery and concurrency but are not AuditEvents, ExecutionProof, or Ledger entries.

## 12. Domain invariants

1. A PayRun belongs to exactly one Project for its full lifetime.
2. Intent precedes Policy; Policy precedes Funding; Funding precedes Payment; Payment precedes Proof; Proof precedes Ledger completion.
3. Approval exists only for `needs_review` and occurs before Funding.
4. Final payment target is USDC on Base unless a future accepted Policy ADR changes it.
5. `completed` means the controlled lifecycle finished; it requires an allowed or Approval-backed current decision, successful FundingPreparation, successful PaymentExecution, a verified ExecutionProof outcome (positive or negative), and a committed balanced Ledger journal. It does not imply that the paid task outcome was positive.
6. Blocked, denied, expired, unsupported funding, and failed PayRuns cannot be marked completed.
7. The same `projectId + command type + idempotency key` cannot create two logical commands, and one deterministic execution key cannot create two logical payment attempts.
8. Aggregate version increases exactly once per committed transition.
9. Audit sequence numbers are monotonic within a PayRun.
10. Receipt and webhook payloads identify their project and PayRun but never expose stored secrets.
11. A Ledger journal is unique by verified proof/external reference and its debit and credit totals balance exactly.
12. A client balance, ERC-20 allowance, quote, transaction hash, webhook callback, or HTTP `2xx` cannot alone establish Funding, Payment, Proof, or completion.
13. Expiry records `expiredAtStage` and a stable reason code. Intent/Approval/Policy expiry has no FundingPreparation; Funding plan/evidence expiry may retain its FundingPreparation but has no PaymentExecution or ExecutionProof.

## 13. Fixed acceptance fixtures

| Fixture | Expected result |
| --- | --- |
| Allowed known merchant | Exact Allowed trace reaches a balanced Sandbox Ledger and atomically records Domain OutboxEvents; Slice 7 adds immutable Receipt and webhook delivery projections without changing payment state |
| Review merchant/amount | Pending subtrace has no Funding/Payment/Proof; approve subtrace rechecks with covered reasons then completes; reject subtrace terminates with no downstream artifacts |
| Blocked risk | Terminates at `blocked`; no Funding, Payment, or Proof |
| Funding mismatch | `environment=sandbox`, adapter `sandbox_simulated`, and FundingPreparation status `sandbox_prepared`; exact ETH/SOL-source plan is simulated with `transactionHash=null`, `realFundsAvailable=false`, and no real swap/bridge claim |
