# ZenFix Slice 4 — Sandbox Control Loop Implementation Plan

**Status:** Planning baseline; implementation not started
**Date:** 2026-07-13
**Base:** `39d95ae51fc190d488390ff375425f763307b550`
**Branch:** `codex/zenfix-slice-4-control-loop`
**Execution profile:** Local Development Sandbox; `SANDBOX / NO REAL FUNDS`

## 1. Goal

Implement one project-scoped, persistent, deterministic Sandbox application service that drives every PayRun through the canonical lifecycle and produces the four frozen pilot scenarios from authoritative records:

```text
PayIntent
→ Policy evaluation
→ Approval request, hard block, or allow
→ BudgetReservation
→ FundingPreparation
→ Sandbox PaymentExecution
→ ExecutionProof / ArtifactProof
→ balanced Sandbox LedgerJournal
→ AuditEvent + DomainOutboxEvent at every transition
→ completed
```

The implementation must reuse the Slice 2 state machine and deterministic Policy Engine, extend only the contracts required by accepted ADR-0005 and ADR-0006, and commit each successful command through the Slice 3 Unit of Work. It must never invoke a wallet, signer, swap, bridge, live RPC write, real payment rail, or production service.

## 2. Scope

Slice 4 includes:

- the four frozen Sandbox fixtures and their exact canonical traces;
- a single `SandboxPayRunControlLoopService` used by all four fixtures;
- server-built Project, Agent, Merchant, Policy, budget, quote, rail, and funding snapshots;
- minimal ADR-0005 domain contracts for `BudgetReservation`, Approval binding, and separation of duties;
- minimal ADR-0006 Sandbox Ledger account-role enforcement;
- project-scoped reservation persistence and the storage schema change needed for it;
- command idempotency, aggregate CAS, atomic Unit of Work commits, Audit, and Domain Outbox;
- deterministic Sandbox Funding, Payment, and artifact/proof adapters;
- read-only `PayRunExplanation` and `ValidationReceiptProjection` projections;
- targeted domain, storage, and control-loop tests plus the full repository Gate.

All money remains canonical unsigned integer atomic decimal strings. The frozen values are `"420000"`, `"440000"`, and `"8000000"` USDC atomic units with six decimals.

## 3. Non-goals

This Slice does not implement or modify:

- UI, `src/app/**`, a pilot-validation route, public API, SDK transport, or authentication system;
- a complete human Approval queue, reviewer workflow, notification path, or Slice 5 concurrency Gate;
- canonical Receipt, receipt versioning, export, webhook endpoint, HTTP outbox delivery, or Slice 7 work;
- Supabase, Postgres, hosted persistence, distributed workers, multi-process writers, or production recovery;
- WalletConnect, wallet signing, token allowance, swap, bridge, x402, real USDC, live payment, settlement, refund, or compensation;
- legacy swap/execute, monitor, storage outside the PayRun adapter, package dependencies, or production configuration;
- new PayRun states, alternate lifecycle shortcuts, mutable Audit/Ledger history, or Local JSON production claims.

## 4. Architecture references

Normative mapping:

| Requirement | Authority | Planned realization |
| --- | --- | --- |
| One lifecycle and state authority | `ARCHITECTURE.md` §§2, 5; ADR-0002; `PAYRUN_STATE_MACHINE.md` §§2–5 | Every step calls `transitionPayRun`; the application never assigns PayRun status. |
| Deterministic fail-closed Policy | `POLICY_ENGINE.md` §§1–4, 6, 8, 12 | Reuse `evaluatePolicy` through `PolicyDecisionPort`; construct inputs from server-side fixture/catalog ports. |
| Project scope, CAS, UoW, idempotency | `ARCHITECTURE.md` §§5, 9; ADR-0004 | All reads/writes include `projectId`; every mutation uses expected version/state and one Local JSON UoW. |
| Reservation and Approval semantics | ADR-0005 §§5–12 | Independent `BudgetReservation`; immutable Approval scope; role separation; atomic activate/release/consume. |
| Audit/Ledger/Receipt separation | ADR-0006 §§5–12 | Append-only Audit, balanced immutable Sandbox journal, read projection only; no canonical Receipt. |
| Sandbox-only Funding | ADR-0003; `FUNDING_LAYER.md` §§1–4, 7, 9 | Deterministic adapters return synthetic evidence, null transaction hash, and false real-capability flags. |
| Four frozen scenarios | `PAYRUN_STATE_MACHINE.md` §9; `PILOT_SCENARIOS.md` §§4–8 | Exact fixtures, traces, artifacts, absences, labels, and final states asserted. |
| Product validation boundary | `PILOT_VALIDATION_GATE.md`; `TRUST_METRICS.md` | Produce trustworthy records/projections only; no study UI or research-data model. |
| Local-only readiness | `SOURCE_COMPLETENESS_AUDIT.md` §§8–9 | No secret or old-machine asset required; Hosted and Live Money remain not ready. |

ADR-0005 and ADR-0006 are `ACCEPTED` and normative. No unresolved prerequisite in the ADR registry blocks this local Slice.

## 5. Domain gap analysis

### Already present and reusable

- Complete canonical PayRun state graph and sole `transitionPayRun` function.
- Immutable `PayIntent`, deterministic `PolicyDecision`, Approval request/decision shell, `FundingPreparation`, `PaymentExecution`, `ExecutionProof`, `ArtifactProof`, `LedgerDraft`, and `LedgerJournal` contracts.
- Runtime schemas, canonical atomic amount validation, Project lineage, evidence-environment checks, terminal-state rules, and serialization round trips.
- Payment evidence, task/artifact evidence, Funding evidence, Audit, Ledger, and Outbox are separate record classes.
- Balanced Ledger validation, one-sided entry rules, exact Payment amount matching, and duplicate proof/external-reference protection.
- Append-only Audit and Domain Outbox lineage helpers.
- Idempotency records and stable request-hash conflict semantics.
- Failure, cancellation, and expiry evidence contracts, including safe-release/no-transfer proof concepts.

### Minimal contract extensions required

1. Add independent `BudgetReservation` aggregate and runtime schema with exactly `active | released | consumed`; no new PayRun status.
2. Model immutable reservation scope: Project, PayRun, Agent, Merchant, rail, budget windows/keys, scope generation, Policy identity/checksum/evaluation digest, intent/Approval/Funding digests, reserved atomic exposure, expiry, and optional Approval decision.
3. Add pure reservation lifecycle functions that create version 1, release or consume by exact expected version/status, retain immutable scope, increment once, and require explicit terminal reason/evidence.
4. Extend ApprovalRequest only for ADR-0005 fields not currently explicit: `agentId`, `purpose`, `amountCeiling`, `policyChecksum`, and authenticated requester actor. Existing Project, Merchant, exact amount, settlement target/asset/chain, rail, Policy version/evaluation digest, funding scope, covered reasons, and expiry remain authoritative.
5. Replace the decision's string-only reviewer representation with an authenticated approver actor contract, or add an equivalent immutable actor field while retaining compatibility. Domain validation must reject the same requester subject and any `system` or `worker` actor as a human approver.
6. Require FundingPreparation to reference the active `budgetReservationId`; the application validates both records in the same UoW. The PayRun may hold only the reference through its stage artifact, not an embedded mutable reservation authority.
7. Define the accepted Sandbox Ledger roles as a closed domain constant: `sandbox_funding_source`, `sandbox_merchant_payable`, `sandbox_fee_account`, and `sandbox_clearing`. Add an explicit entry role or an unambiguous validated account-ID parser; Sandbox entries must use only these roles and a Project-scoped Sandbox namespace.
8. Add reservation-specific stable errors for invalid lifecycle/scope/terminal evidence, while retaining `VersionConflictError`, `ProjectScopeError`, and `IdempotencyConflictError` for shared failures.

### Explicitly not added

- no `reserved`, `approval_pending`, `proof_pending`, or other PayRun state;
- no mutable budget counter in Policy or PayRun;
- no canonical Receipt contract implementation;
- no live account chart, live settlement evidence, or real Funding/Payment type.

## 6. Persistence gap analysis

### Already present and reusable

The Slice 3 envelope and repositories persist PayRun, Approval, FundingPreparation, PaymentExecution, LedgerJournal/entries, AuditEvent, DomainOutboxEvent, IdempotencyRecord, and InboxEvent. ExecutionProof is durably stored inside the canonical PayRun and validated as an independent evidence object; a separate ExecutionProof repository is not required by current Architecture.

The adapter already provides:

- checksummed canonical envelope validation;
- atomic same-directory temporary write, file fsync, rename, and directory-fsync semantics;
- same-process multi-instance serialization by canonical real path;
- a single-writer cross-process lease;
- memory working-copy rollback and one-file Unit of Work commit;
- project-scoped repositories, aggregate CAS, append-only Audit/Outbox/Ledger behavior, and restart persistence;
- explicit corruption/schema/lease/durability errors with no seed fallback.

### Minimal storage extensions required

1. Add `budgetReservations` as a dedicated envelope collection, mutable working-copy collection, validation/index set, and Local JSON storage/repository surface.
2. Add `BudgetReservationRepository` with project-scoped `get`, active-reservation query by exact budget keys, `insert`, and status/version CAS. It exposes no delete or arbitrary overwrite.
3. Add `budgetReservations` to `PayRunUnitOfWorkContext` and `LocalJsonPayRunStorage` so activation, release, and consumption can share the PayRun transaction.
4. Bump the Local JSON schema from v1 to v2. Implement one explicit, checksummed v1→v2 migration that validates the complete v1 envelope first, adds an empty `budgetReservations` collection, increments generation once, and atomically replaces the file while holding/rechecking the writer lease. Corrupt, unsupported, or partially valid stores must not migrate or reinitialize. A v2 reader rejects versions other than the explicitly supported v1 migration input and v2 current format.
5. Extend payload indexes for `projectId + id` and `projectId + payRunId + scopeGeneration`; validate reservation lineage/status/schema on every read and write.
6. Preserve existing independent collections. ExecutionProof remains in PayRun for this Slice; LedgerJournal remains independently append-only; Audit and Outbox remain independent append-only histories.

The extension does not change the Local JSON concurrency guarantee: multi-call safe, multi-instance safe within one process, single writer across processes, and not production multi-process storage.

## 7. Application components

### Primary use case

`SandboxPayRunControlLoopService.execute(command): Promise<SandboxControlLoopResult>` is the only Slice 4 orchestration entry.

Conceptual command:

```ts
interface ExecuteSandboxPayRunCommand {
  projectId: string;                 // server/auth context, never fixture body override
  scenarioId: "allowed" | "needs_review" | "blocked" | "funding_mismatch";
  idempotencyKey: string;
  correlationId: string;
  requester: DomainActor;
}
```

The fixture selector contains no status, decision, reviewer, evidence, transaction hash, or canonical artifact supplied by a client. It selects deterministic server-owned source data only.

### Supporting components

- `SandboxScenarioCatalog`: resolves frozen Project/Agent/Merchant/Policy/quote/funding-source records and rejects cross-Project or unknown fixtures.
- `SandboxSnapshotBuilder`: creates the complete `PolicyEvaluationRequest` from authoritative repositories/catalogs, Ledger usage, and active reservations.
- `ControlLoopCommandExecutor`: applies one legal transition at a time with canonical request hash, expected versions, Audit, Outbox, and idempotency.
- `BudgetReservationService`: rechecks budget eligibility and activates/releases/consumes reservations only inside a supplied UoW context.
- `SandboxLedgerBuilder`: derives a balanced draft/journal from verified Payment and ExecutionProof evidence.
- `PayRunExplanationProjector`: reads committed project-scoped records and returns non-authoritative explanation objects.

### Orchestration order

1. Resolve Project scope and command replay by `projectId + commandType + idempotencyKey`.
2. Resolve the frozen scenario catalog and build/validate the PayIntent on the server.
3. Create `intent_recorded` with Audit, Outbox, and completed command idempotency in one UoW.
4. Enter `policy_evaluating` with attempt metadata in one UoW.
5. Build the authoritative Policy snapshot, including Ledger usage and active reservations, and call the existing deterministic Policy port outside the write transaction.
6. Commit one Policy result:
   - `needs_review`: create pending Approval and transition to `pending_review`; stop;
   - `blocked`: transition to `blocked`; stop;
   - `allowed`: transition to `policy_allowed`; continue.
7. Re-read current controls/budget and, in one UoW, activate the reservation, insert requested FundingPreparation, transition `policy_allowed → funding_preparing`, and append Audit/Outbox/idempotency.
8. Call the deterministic Funding port outside the UoW using the immutable plan and key; commit `funding_prepared` only with accepted Sandbox/not-required evidence.
9. In one UoW, persist prepared PaymentExecution and transition to `payment_executing`; call the deterministic payment adapter outside the UoW; then commit authoritative simulated success as `payment_succeeded`.
10. In one UoW, persist proof request and enter `proof_collecting`; call the deterministic artifact port outside the UoW; validate evidence and commit `proof_collected` only for verified proof.
11. Build a balanced draft, commit `ledger_recording`, then in the terminal UoW append the immutable LedgerJournal, consume the active reservation, CAS PayRun to `completed`, and append Audit/Outbox/idempotency.
12. Read committed sources and return `PayRunExplanation`; optionally wrap it as `ValidationReceiptProjection` with `canonicalReceiptAvailable=false`.

The high-level call advances until a stable stop: `pending_review`, a terminal state, or a reconciliation-required state. It never skips a canonical transition. Each stage command has a deterministic derived key so retry resumes from committed state rather than replaying completed stages.

## 8. Sandbox adapters

| Adapter | Contract | Deterministic behavior | Forbidden behavior |
| --- | --- | --- | --- |
| Scenario catalog | Project/Agent/Merchant/Policy/quotes/funding source | Returns frozen, project-scoped data for A–D | Client authority, network lookup, fallback to first/demo record |
| Policy adapter | `PolicyDecisionPort` | Delegates to existing `evaluatePolicy` | Side effects, mutable budgets, manufactured decision on dependency failure |
| Funding adapter | `FundingPreparationPort` refined to immutable request/result | A: `not_required`; D: `sandbox_prepared`, simulated route and evidence | Calldata, allowance, signature, RPC write, swap/bridge, transaction hash |
| Payment rail | prepared instruction + deterministic execution key | Synthetic authoritative success and stable Sandbox provider reference | Real rail, x402, wallet, settlement, external HTTP payment |
| Artifact provider | proof request + successful Payment | Stable artifact bytes/reference/checksum and verified synthetic proof | Treating Payment proof or HTTP success as task proof |
| Ledger builder | verified Payment + ExecutionProof | Exact balanced entries in accepted Sandbox roles | Live accounts, mutable journal, unbalanced or inferred value |
| Outbox recorder | existing repository | Persists stable domain events in UoW | HTTP delivery, webhook configuration, retries to external endpoints |

Every Sandbox evidence record has `environment=sandbox`, a `sandbox_*` evidence kind, `synthetic=true`, `transactionHash=null`, and safe wording. Funding mismatch additionally fixes `realFundsAvailable=false`, `realBridgeCapability=false`, and display text `Simulation completed`.

## 9. Four scenario sequences

### Scenario A — Allowed

```text
known Merchant + 420000 atomic USDC
→ intent_recorded
→ policy_evaluating
→ policy_allowed (no human Approval)
→ activate BudgetReservation
→ funding_preparing (FundingPreparation requested)
→ funding_prepared (not_required + deterministic Sandbox evidence)
→ payment_executing
→ payment_succeeded (synthetic payment evidence)
→ proof_collecting
→ proof_collected (verified service artifact)
→ ledger_recording
→ append balanced Sandbox Ledger + consume reservation
→ completed
```

Final: `completed`; one consumed reservation; no human Approval; `realFundsMoved=false`; canonical Receipt absent.

### Scenario B — Needs Review

```text
registered new Merchant + 440000 atomic USDC
→ intent_recorded
→ policy_evaluating
→ needs_review + immutable pending ApprovalRequest
→ pending_review
→ stop
```

Final: `pending_review`; no reservation, FundingPreparation, PaymentExecution, proof request, ExecutionProof, LedgerJournal, downstream adapter call, or canonical Receipt.

The domain/application tests also cover approve/recheck and reject semantics required by ADR-0005, but the frozen research fixture does not expose an approval action and does not continue. The complete Approval workflow and competing-human execution Gate remain Slice 5.

### Scenario C — Blocked

```text
existing Merchant with trustState=unknown + 8000000 atomic USDC
→ intent_recorded
→ policy_evaluating
→ blocked (primary reason merchant.unknown)
→ stop
```

Final: `blocked`; no Approval, reservation, Funding, Payment, proof, Ledger, downstream adapter call, or canonical Receipt.

### Scenario D — Funding Mismatch

```text
same Merchant/purpose/Policy/amount as A; synthetic ETH/Ethereum source
→ intent_recorded
→ policy_evaluating
→ policy_allowed
→ activate BudgetReservation
→ funding_preparing
→ funding_prepared (sandbox_prepared; swap_and_bridge explanation only)
→ payment_executing
→ payment_succeeded
→ proof_collecting
→ proof_collected
→ ledger_recording
→ append balanced Sandbox Ledger + consume reservation
→ completed
```

Final: `completed`; one consumed reservation; simulated Funding only; no real swap, bridge, USDC availability, settlement, or transaction hash.

## 10. State transitions

The existing state table is unchanged. Slice 4 exercises these edges:

| From | To | Required new/updated record | Stable stop? |
| --- | --- | --- | --- |
| none | `intent_recorded` | PayRun, PayIntent | No |
| `intent_recorded` | `policy_evaluating` | PolicyEvaluationAttempt | No |
| `policy_evaluating` | `policy_allowed` | allowed PolicyDecision | No |
| `policy_evaluating` | `pending_review` | needs-review PolicyDecision + pending Approval | Yes for Scenario B |
| `policy_evaluating` | `blocked` | blocked PolicyDecision | Yes for Scenario C |
| `pending_review` | `approved` / `denied` | final immutable Approval decision | Domain/application contract tests only |
| `approved` | `policy_evaluating` | Approval-aware recheck attempt | Domain/application contract tests only |
| `policy_allowed` | `funding_preparing` | active reservation + requested FundingPreparation | No |
| `funding_preparing` | `funding_prepared` | accepted Funding evidence | No |
| `funding_prepared` | `payment_executing` | prepared PaymentExecution | No |
| `payment_executing` | `payment_succeeded` | authoritative simulated payment evidence | No |
| `payment_succeeded` | `proof_collecting` | ExecutionProofRequest | No |
| `proof_collecting` | `proof_collected` | verified ExecutionProof/ArtifactProof | No |
| `proof_collected` | `ledger_recording` | balanced LedgerDraft | No |
| `ledger_recording` | `completed` | immutable LedgerJournal + consumed reservation | Yes |

Blocked, denied, expired, cancelled, failed, and completed remain terminal. Product labels such as `created` and `proof_pending` remain projection copy, never states.

## 11. Unit of Work boundaries

Each row below is one atomic Local JSON envelope replacement. External adapter calls occur between transactions and never while the UoW is open.

| Command boundary | Atomic contents |
| --- | --- |
| Create PayRun | PayRun insert + idempotency result + first AuditEvent + first DomainOutboxEvent |
| Begin Policy | PayRun CAS + evaluation attempt + idempotency + Audit + Outbox |
| Commit Policy allow/block | PayRun CAS + PolicyDecision + idempotency + Audit + Outbox |
| Commit review request | PayRun CAS + Approval insert + needs-review decision + idempotency + Audit + Outbox |
| Commit Approval decision | Approval CAS + PayRun CAS + idempotency + Audit + Outbox |
| Enter Funding | authoritative budget reread + active reservation insert + FundingPreparation insert + PayRun CAS + idempotency + Audit + Outbox |
| Commit Funding result | FundingPreparation CAS + PayRun CAS + idempotency + Audit + Outbox |
| Prepare/commit Payment stage | PaymentExecution insert/CAS + PayRun CAS + idempotency + Audit + Outbox |
| Request/commit Proof stage | PayRun CAS containing request/proof + idempotency + Audit + Outbox |
| Prepare Ledger | PayRun CAS containing balanced draft + idempotency + Audit + Outbox |
| Complete Ledger | LedgerJournal append + reservation CAS active→consumed + PayRun CAS ledger_recording→completed + idempotency + Audit + Outbox |
| Safe terminal release | reservation CAS active→released + legal PayRun/stage CAS + reason/evidence + idempotency + Audit + Outbox |

Any project mismatch, schema failure, stale expected version/state, uniqueness failure, idempotency conflict, Audit/Outbox append error, checksum generation failure, lease loss, or disk write failure rolls back the working copy. No adapter call is launched from a failed preparation transaction.

## 12. Reservation lifecycle

### Activation

- Created only on `policy_allowed → funding_preparing`.
- The application rereads current Ledger usage and active reservations and rechecks the decision, quote, Project control, intent expiry, Approval when present, and all expected versions.
- One logical reservation is unique by `projectId + payRunId + scopeGeneration`.
- Exposure equals the conservatively counted payment amount plus any counted fee in canonical atomic units.
- A Policy-auto-allowed path has no Approval decision ID and is not described as self-approved.

### Active

- Counts with committed Ledger usage for later Policy evaluations.
- Remains active through Funding, Payment, Proof, and Ledger preparation.
- Remains active during an ambiguous submitted external outcome; timeouts do not release it.
- Its amount, budget keys, digests, Project, PayRun, or scope generation cannot mutate.

### Release

- `active → released` only, version increment exactly once.
- Requires a stable release reason and authoritative Sandbox no-effect/safe-release evidence when an active reservation exists.
- Legal cases: pre-effect intent/plan expiry, cancellation, or authoritative no-effect Funding/Payment failure.
- Scenario B rejection/expiry occurs before reservation and therefore creates no synthetic released reservation.
- A duplicate release command returns the original result; incompatible replay conflicts.

### Consumption

- `active → consumed` only in the same terminal UoW as the balanced LedgerJournal and `ledger_recording → completed`.
- Requires the exact journal/payment/proof references and consumption reason.
- A failed or duplicate terminal commit cannot consume twice or produce a usage gap.

## 13. Approval binding

The Approval scope digest canonically binds:

- Project and PayRun;
- Agent and authenticated requester;
- Merchant/payee and purpose;
- maximum authorized amount ceiling and exact requested amount;
- asset, Base chain target, rail, and Funding scope/plan digest;
- Policy ID, version, checksum, evaluation snapshot/digest;
- covered review reason codes and expiry.

Rules:

1. `pending_review` creates no reservation or downstream artifact.
2. Requester and human approver are distinct authenticated subjects.
3. `system` and `worker` actors, including the service executor, cannot create a human ApprovalDecision.
4. Approval expiry, missing capability, identity ambiguity, cross-Project actor, digest mismatch, or any bound-field change fails closed.
5. An approved decision transitions only to `approved`, then to `policy_evaluating`; it never jumps to Funding.
6. The recheck refreshes Policy, Merchant, quote, budget/reservations, kill switch, and expiry. It consumes only unchanged covered review reasons.
7. A new review reason creates a new pending Approval generation; a hard block wins; unchanged covered reasons may allow with `authorizationBasisApprovalDecisionId`.
8. A denied decision transitions to terminal `denied` and has no reservation.

Slice 4 proves these contracts without adding a public review queue. Slice 5 remains responsible for the full reviewer-facing workflow and its complete concurrency/one-execution Gate.

## 14. Ledger balancing rules

- One immutable journal contains at least two immutable entries for one exact asset reference.
- Each entry has exactly one positive side; the other side is `"0"`.
- Total debit equals total credit exactly using integer atomic arithmetic.
- Journal total equals the PaymentInstruction amount exactly.
- Journal Project, PayRun, environment, PaymentExecution, ExecutionProof, provider reference, and evidence hashes must match committed sources.
- Duplicate journal ID, ExecutionProof ID, or Sandbox external reference is rejected.
- Account IDs are Project-scoped and Sandbox-qualified, for example `sandbox:<projectId>:sandbox_merchant_payable`.
- The basic zero-fee fixture posts one debit to `sandbox_merchant_payable` and one credit to `sandbox_funding_source` for the same amount. `sandbox_fee_account` and `sandbox_clearing` are used only when a non-zero, Policy-counted fee requires its own balanced pair; zero entries are not fabricated.
- The four accepted roles describe simulated accounting only and never wallet, custody, bank, token, swap, bridge, or settlement balances.
- A financial correction never edits a journal. Reversal/correction PayRuns remain deferred under ADR-0006.

Audit explains the action; Ledger records balanced simulated value; the explanation projection reads both. None substitutes for another.

## 15. Audit / Outbox events

Every canonical transition appends exactly one PayRun AuditEvent and one DomainOutboxEvent with stable IDs, aggregate version, sequence, correlation ID, command idempotency key, actor, action/reason code, before/after state, and Sandbox environment.

Required action/reason coverage includes:

- PayRun created and Policy evaluation started;
- Policy allowed, review required, or blocked;
- Approval requested, approved, denied, expired, or invalidated;
- reservation activated, safely released, or consumed as part of the originating transition;
- Funding requested/prepared/failed;
- Payment prepared/succeeded/unknown/failed-no-transfer;
- Proof requested/verified;
- Ledger prepared/committed and PayRun completed.

The event payload may include safe IDs/digests and reservation status but not secrets, raw artifact content, fake transaction hashes, or mutable authority snapshots. Audit and Outbox append inside the same UoW as their transition. Slice 4 records Outbox only; it does not deliver HTTP webhooks.

## 16. Idempotency and retries

- Scope: `projectId + commandType + idempotencyKey` with a canonical request hash.
- Same key and same hash returns the committed resource/version/result without another transition, adapter call, reservation, journal, Audit event, or Outbox event.
- Same key and different hash throws `IdempotencyConflictError`.
- Each high-level scenario execution derives stable per-stage keys from the root key and immutable stage identity.
- CAS and idempotency are both required: CAS prevents stale overwrite; idempotency prevents logical replay.
- External adapter calls receive stable execution keys prepared before the call. Retry first loads the persisted stage/result; it never invents another key.
- For these deterministic Sandbox adapters, a stable key returns byte-equivalent evidence. The application still preserves `unknown`/reconciliation semantics so the port contract does not teach unsafe live retry behavior.
- A concurrent reservation race loses atomically, reloads authoritative budget usage, and re-evaluates Policy; it is never auto-allowed across a human boundary.
- Ledger replay converges only when canonical journal hash and evidence identities match; mismatched evidence conflicts.

## 17. Failure, cancellation, and expiry behavior

| Failure point | PayRun behavior | Reservation behavior | Forbidden consequence |
| --- | --- | --- | --- |
| Fixture/catalog/snapshot unavailable | fail closed before authorization; evaluation error remains distinguishable | none | manufactured Policy decision |
| Policy dependency error | remain/retry `policy_evaluating` within bounded application policy | none | Funding artifact |
| Approval expired/scope mismatch/invalid actor | remain pending or transition legally to expiry as commanded | none | Approval reuse or Funding |
| CAS/idempotency/UoW failure | retain last committed state | unchanged | partial Audit/Outbox/artifact or adapter call |
| Funding authoritative no-effect failure | legal `failed` with evidence | release atomically | Payment/Proof/Ledger |
| Funding ambiguous effect | remain `funding_preparing` for reconciliation | active | release/cancel/replacement |
| Payment authoritative no-transfer failure | legal `failed` with no-transfer evidence | release atomically | Proof or Ledger |
| Payment ambiguous result | `payment_unknown` | active | duplicate submit or completion |
| Artifact unavailable/unverified | remain/retry `proof_collecting` | active | `proof_collected`, Ledger, completion |
| Ledger validation/write failure | remain `ledger_recording` | active | terminal failure or consumed reservation |
| Pre-effect expiry/cancellation with active reservation | legal terminal path with safe-release evidence | release atomically | silent delete |
| Process restart | reload committed stage/idempotency/evidence and resume | loaded unchanged | seed fallback or recreated records |

Because the fixed Sandbox happy paths have no real external effect, failure evidence remains explicitly synthetic and cannot be cited as proof of real reversal, settlement, or funds.

## 18. Read projections

`PayRunExplanation` is assembled from committed project-scoped PayRun, Approval, reservation, Funding, Payment, proof, Ledger, Audit, and Outbox records. It is immutable output data for a read request, not a persisted authority and not an input to transitions.

`ValidationReceiptProjection` wraps the explanation for research-style rendering and always declares:

```text
projectionKind = validation_receipt
canonicalReceiptAvailable = false
environment = sandbox
watermark = SANDBOX / NO REAL FUNDS
realFundsMoved = false
```

Projection variants:

- Completed: canonical status, intent/Merchant, ordered Policy checks, reservation summary, Funding simulation/not-required evidence, Payment evidence, artifact proof, and balanced Ledger summary.
- Pending Review: decision and immutable Approval request explanation, next action `human_review_required`, and explicit downstream absences.
- Blocked: Policy decision/version/ordered checks and stable block reason, next action `stop`, and explicit downstream absences.

The projector cannot synthesize missing evidence, change status, write Audit, create Receipt, or describe Sandbox evidence as settlement.

## 19. Exact files to add or modify during implementation

### Domain — minimal ADR extensions

- Modify `src/features/payrun/domain/types.ts`
- Modify `src/features/payrun/domain/schemas.ts`
- Modify `src/features/payrun/domain/invariants.ts`
- Modify `src/features/payrun/domain/state-machine.ts`
- Modify `src/features/payrun/domain/errors.ts`
- Add `src/features/payrun/domain/budget-reservation.ts`

### Application

- Modify `src/features/payrun/application/ports.ts`
- Add `src/features/payrun/application/control-loop.ts`
- Add `src/features/payrun/application/control-loop-commands.ts`
- Add `src/features/payrun/application/control-loop-idempotency.ts`
- Add `src/features/payrun/application/payrun-explanation.ts`

### Local JSON persistence — minimal extension

- Modify `src/features/payrun/adapters/storage/store-envelope.ts`
- Modify `src/features/payrun/adapters/storage/coordinator.ts`
- Modify `src/features/payrun/adapters/storage/repositories.ts`
- Modify `src/features/payrun/adapters/storage/local-json-storage.ts`
- Modify `src/features/payrun/adapters/storage/index.ts`
- Add `src/features/payrun/adapters/storage/store-migration.ts`

### Deterministic Sandbox adapters

- Add `src/features/payrun/adapters/sandbox/fixtures.ts`
- Add `src/features/payrun/adapters/sandbox/policy.ts`
- Add `src/features/payrun/adapters/sandbox/funding.ts`
- Add `src/features/payrun/adapters/sandbox/payment.ts`
- Add `src/features/payrun/adapters/sandbox/artifact.ts`
- Add `src/features/payrun/adapters/sandbox/ledger.ts`
- Add `src/features/payrun/adapters/sandbox/index.ts`

### Tests

- Add `src/test/payrun/domain/budget-reservation.test.ts`
- Add `src/test/payrun/domain/approval-binding.test.ts`
- Modify `src/test/payrun/domain/fixtures.ts`
- Modify `src/test/payrun/domain/schemas.test.ts`
- Modify `src/test/payrun/domain/invariants.test.ts`
- Modify `src/test/payrun/domain/state-machine.test.ts`
- Modify `src/test/payrun/domain/serialization.test.ts`
- Modify `src/test/payrun/domain/ports.test.ts`
- Add `src/test/payrun/storage/budget-reservations.test.ts`
- Add `src/test/payrun/storage/schema-migration.test.ts`
- Modify `src/test/payrun/storage/fixtures.ts`
- Modify `src/test/payrun/storage/store-envelope.test.ts`
- Modify `src/test/payrun/storage/unit-of-work.test.ts`
- Add `src/test/payrun/control-loop/fixtures.ts`
- Add `src/test/payrun/control-loop/four-scenarios.test.ts`
- Add `src/test/payrun/control-loop/idempotency-and-concurrency.test.ts`
- Add `src/test/payrun/control-loop/failure-recovery.test.ts`
- Add `src/test/payrun/control-loop/projections.test.ts`

### Documentation

- Modify only this implementation plan if execution discovers a verified, scope-preserving clarification.

No `src/app/**`, legacy, monitor, package, Vercel, Hosted, or production file belongs to the implementation scope.

## 20. TDD order

Every task starts with a focused failing test, demonstrates the intended failure, implements the minimum behavior, then reruns the focused test before the next task.

1. **Reservation domain contract:** add failing runtime schema/lifecycle/immutability/version/project tests; implement types, schema, errors, and pure lifecycle functions.
2. **Approval ADR binding:** add failing scope-field, actor, self-approval, executor, expiry, and immutable-generation tests; minimally extend Approval contracts/invariants/state-machine logic.
3. **Sandbox Ledger roles:** add failing accepted-role, namespace, exact-balance, and live-claim rejection tests; extend role validation without changing journal authority.
4. **Storage v2 and migration:** add failing fresh-v2, validated-v1 migration, corrupt-v1 rejection, restart, and generation tests; implement the atomic schema migration.
5. **Reservation repository/UoW:** add failing project scope, unique generation, CAS, active query, rollback, restart, and atomic cross-record tests; extend ports and Local JSON repositories.
6. **Sandbox fixtures/snapshot builder:** add failing exact A–D input and cross-Project/catalog tests; implement deterministic server-owned catalog and Policy input construction.
7. **Policy/review/block orchestration:** add failing traces through `policy_allowed`, `pending_review`, and `blocked`, plus forbidden adapter-call assertions; implement early control-loop stages.
8. **Funding/reservation orchestration:** add failing atomic activation, duplicate, contention, safe release, A `not_required`, and D `sandbox_prepared` tests; implement deterministic Funding adapter and UoW.
9. **Payment orchestration:** add failing prepared/success/failure/unknown/evidence-separation tests; implement deterministic rail with stable execution keys.
10. **Artifact/proof orchestration:** add failing verified/unverified/failure/retry tests; implement deterministic artifact adapter and proof transitions.
11. **Ledger completion:** add failing balanced completion, unbalanced rejection, duplicate posting, reservation-consumption, and fault rollback tests; implement builder and terminal UoW.
12. **Read projections:** add failing completed/pending/blocked projection and prohibited-claim tests; implement pure projectors.
13. **Four-scenario acceptance:** assert exact traces, artifacts, absences, adapter call counts, restart results, and labels through the one service.
14. **Regression and Gate:** targeted suites, typecheck, full tests, lint, build, and legacy smoke; fix only Slice 4-caused failures.

Implementation remains one independent Slice. After all Gates and one final scope review, create one focused Slice 4 commit rather than intermediate product commits.

## 21. Test matrix

| ID | Test | Expected proof |
| --- | --- | --- |
| S4-01 | Allowed full lifecycle | Exact 12-state trace ends `completed`; no human Approval. |
| S4-02 | Needs Review stop | Ends `pending_review`; pending Approval exists; no reservation/downstream artifacts or calls. |
| S4-03 | Blocked stop | Existing unknown Merchant yields `merchant.unknown`; no Approval/reservation/downstream artifacts or calls. |
| S4-04 | Funding Mismatch lifecycle | Ends `completed`; `sandbox_prepared`, simulated route, null transaction hash, false real flags. |
| S4-05 | Duplicate root command | Same key/hash returns original result and no duplicate transition/effect/event. |
| S4-06 | Mismatched idempotency reuse | Same key/different hash conflicts with no write. |
| S4-07 | Stale PayRun CAS | Stable version conflict; generation and all collections unchanged. |
| S4-08 | Concurrent reservation contention | At most eligible reservation set commits; no overspend/lost update. |
| S4-09 | Approval bound-field mismatch | Agent/Merchant/purpose/ceiling/asset/chain/rail/Policy/scope change rejects reuse. |
| S4-10 | Requester self-approval | Rejected before Approval or PayRun mutation. |
| S4-11 | Executor-as-approver | `worker`/`system` actor rejected as human approver. |
| S4-12 | Expired Approval | Approval decision/recheck rejected; no reservation/Funding. |
| S4-13 | Approval-aware recheck | Unchanged covered reason allows with authorization basis; new reason reviews; hard block wins. |
| S4-14 | Reservation activates once | Unique Project/PayRun/scope generation and version 1. |
| S4-15 | Reservation consumed once | Terminal UoW creates one journal, one consumption, one terminal transition. |
| S4-16 | Failure releases reservation | Authoritative pre-effect/no-transfer failure releases with explicit reason in same UoW. |
| S4-17 | Ambiguous outcome retention | Unknown Funding/Payment keeps reservation active and prevents replacement/completion. |
| S4-18 | Cancellation/expiry release | Active pre-effect reservation releases atomically; pre-reservation path creates none. |
| S4-19 | Ledger balanced | Exact atomic debits equal credits and Payment amount using accepted roles. |
| S4-20 | Ledger imbalance rejected | No journal, no consumption, PayRun remains `ledger_recording`. |
| S4-21 | Duplicate Ledger evidence | Proof/external-reference replay yields one journal; mismatch conflicts. |
| S4-22 | Audit append-only | Monotonic sequence/version/actor/reason; update/delete unavailable. |
| S4-23 | Outbox lineage | Exactly one event per aggregate version with matching payload and no HTTP delivery. |
| S4-24 | Artifact failure | Unavailable/unverified artifact cannot enter `proof_collected` or complete. |
| S4-25 | Payment failure | Authoritative no-transfer failure has no Proof or Ledger completed entry. |
| S4-26 | Payment/Execution/Artifact separation | Payment evidence cannot satisfy artifact proof or Ledger proof binding. |
| S4-27 | UoW fault injection | Failure at reservation/stage/CAS/idempotency/Audit/Outbox/Ledger/write rolls back all records. |
| S4-28 | Restart persistence | Reopen v2 store and read complete PayRun, reservation, evidence, Ledger, Audit, Outbox, idempotency. |
| S4-29 | Valid v1→v2 migration | Full v1 validation precedes one atomic generation increment and empty reservation collection. |
| S4-30 | Invalid migration input | Malformed/checksum/schema/runtime-invalid store fails explicitly and is unchanged. |
| S4-31 | Project isolation | Every repository, service command, fixture, and projection hides/rejects cross-Project records. |
| S4-32 | Sandbox evidence contract | All proof is synthetic/null-hash and contains no live settlement/funds/swap/bridge claim. |
| S4-33 | Projection authority | Completed/pending/blocked views match committed records and cannot mutate state. |
| S4-34 | No canonical Receipt | All scenarios return `canonicalReceiptAvailable=false`; no Receipt repository/record exists. |
| S4-35 | Same service for A–D | All fixtures enter one control-loop use case and one state transition function. |
| S4-36 | Store generation semantics | Each successful UoW increments once; failed/replayed commands do not increment. |

## 22. Full Gate

Run focused suites after each RED/GREEN step, then run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke
```

Also inspect `git diff --name-only origin/main...HEAD` and `git status --short` to prove only planned Slice 4 files changed and no temporary store, lock, migration fixture, or mirror remains. The legacy smoke must pass without changing legacy product behavior.

## 23. Definition of Done

Slice 4 is complete only when:

- all four frozen scenarios are produced by one canonical persisted service with exact traces/final states;
- ADR-0005 reservation, Approval binding, role separation, atomic activation/release/consumption, and concurrency requirements are implemented and tested;
- ADR-0006 balanced immutable Sandbox Ledger, accepted role, Audit/Outbox separation, and no-Receipt boundary are implemented and tested;
- pending Review and Blocked have zero downstream artifacts and zero downstream adapter calls;
- completed has current allowed Policy evidence, accepted Funding, successful Sandbox Payment, verified Execution/Artifact proof, balanced Ledger, consumed reservation, Audit, and Outbox;
- idempotency, CAS, project isolation, restart persistence, v1→v2 migration, rollback, and fault-injection tests pass;
- every Sandbox record/projection is visibly synthetic and makes no real-funds/settlement claim;
- all public service, port, repository, domain lifecycle, adapter, and projection behavior maps to a test;
- the full Gate passes and legacy smoke confirms no legacy behavior change;
- the diff contains only the files listed in Section 19, with one final independent review and no scope-expanding fixes.

## 24. Deferred items

- Slice 5: full Approval queue/workflow, human reviewer integration, notifications, competing decisions, recheck execution, and one-execution Gate.
- Slice 6: project-scoped public `/api/v1`, API-key authentication, scopes, schemas, and errors.
- Slice 7: canonical Receipt persistence/version/corrections, export, webhook endpoints, HTTP outbox delivery, retry/DLQ/replay.
- Product Validation Checkpoint UI and moderated five-person study after Slice 4 technical Gate.
- Hosted Sandbox artifact isolation, Vercel authoritative configuration, IAM/secret/egress separation, and ADR-0009 controls.
- Postgres/Supabase, database transactions, durable multi-process CAS, row-level isolation, migrations, PITR, and ADR-0010.
- live Funding/Payment rail, Wallet/signers, Base bridge, finality, reconciliation, custody, financial corrections, security/accounting review, and ADR-0011.
- legacy monitor/wallet/env recovery and production governance issues identified by the source-completeness audit.

None of these deferred items blocks deterministic local Slice 4 execution.
## 25. Rollback strategy

Before any root cutover, Slice 4 is additive. Rollback is:

1. stop new local Sandbox commands;
2. preserve the Local JSON v2 store and all immutable PayRun, reservation, Ledger, Audit, and Outbox records;
3. revert the single Slice 4 implementation commit or return to the preceding artifact;
4. do not run an older v1 binary against a v2 store unless it is read-compatible—v1 is expected to reject v2 explicitly;
5. resume only with a compatible v2 reader or after an explicit forward repair/migration; never delete reservations, journals, Audit, or Outbox history and never seed over the store.

Because Slice 4 performs no real financial effect, rollback requires no financial compensation. It does not authorize silent status reversal, history edits, or fallback to legacy execute paths.

## Plan self-review

- The 25 required sections are present and decision-complete; no placeholder remains.
- Every normative requirement maps to existing Architecture or accepted ADR-0005/0006.
- The plan adds no state and preserves one transition authority and one lifecycle for all scenarios.
- Review/Blocked execution leakage is prohibited and tested.
- Local JSON remains Local Development Sandbox Persistence, not a production database.
- Sandbox proof, Funding, Payment, accounts, and Ledger are explicitly simulated and never described as real settlement.
- Canonical Receipt, UI, API, Hosted, Postgres, Live Money, wallet, swap, bridge, and webhook delivery remain outside Slice 4.
- Every planned public behavior and error path has a test mapping.
- ADR-0005 and ADR-0006 requirements are mutually consistent: reservation consumption and balanced Ledger completion share one terminal UoW.
- The proposed file scope is limited to minimal domain/storage extensions, the application service, deterministic Sandbox adapters, tests, and this plan.
- No additional ADR is required for the planned local Sandbox behavior. A new ADR is still mandatory before any live rail or Hosted persistence capability.
