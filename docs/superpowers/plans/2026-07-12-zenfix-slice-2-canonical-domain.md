# ZenFix Slice 2 Canonical PayRun Domain Implementation Plan

> **For Codex:** Execute this plan with strict red-green-refactor discipline. Keep the entire slice in one final commit and do not begin Slice 3.

**Goal:** Add a framework-free, side-effect-free, runtime-validated canonical PayRun domain that makes the Architecture Baseline lifecycle, evidence requirements, project isolation, version/CAS preparation, Approval semantics, Ledger boundary, Audit append-only behavior, and Domain Outbox emission executable and testable without changing any legacy behavior.

**Architecture:** The new domain is additive under `src/features/payrun`. `PayRun` is the only lifecycle status authority. Creation and every legal state change return an immutable transition bundle containing the next PayRun, idempotency result, AuditEvent, and DomainOutboxEvent; later slices will persist that bundle atomically through the declared project-scoped Unit of Work port. No adapter, route, UI, storage, external effect, or legacy import is introduced.

**Tech Stack:** TypeScript 5, Vitest 3, dependency-free runtime schemas, existing Next.js 14 / React 18 toolchain.

## Authority and conflict resolution

- Normative authority: `docs/architecture/**` and Accepted ADR-0001 through ADR-0004.
- Product documents narrow the investment order and pilot focus only; they do not reduce the Slice 2 Gate.
- Slice 2 implements pure domain semantics and ports for CAS, idempotency, Audit, Domain Outbox, Approval, Funding, Payment, Proof, and Ledger.
- Repository atomicity, callback persistence/deduplication, budget reservation concurrency, and scenario orchestration are represented as contracts and pure invariants here; their adapter/integration proofs remain in Slices 3-5.
- ADR-0005 and ADR-0006 are not pre-empted: this slice defines conservative domain semantics but no Approval workflow, reservation implementation, or Ledger persistence.
- `DomainOutboxEvent` is the domain transition event; it is intentionally distinct from future Slice 7 webhook delivery.

## Non-goals

- No UI, API route, local JSON/Supabase adapter, payment/funding/artifact adapter, webhook dispatcher, canonical Receipt renderer, legacy swap refactor, framework upgrade, or real-money capability.
- No edits to existing legacy product files or behavior.
- No status aliases such as `created` or `proof_pending`; product copy maps to canonical states only in future read projections.

## Task 1: Establish canonical types and stable errors

**Files:**

- Create: `src/features/payrun/domain/errors.ts`
- Create: `src/features/payrun/domain/types.ts`
- Test: `src/test/payrun/domain/schemas.test.ts`

1. Write failing compile/runtime tests that import canonical enums/types and schema entry points.
2. Define stable domain error codes for schema, transition, terminal-state, version, project-scope, idempotency, audit append, evidence-environment, expiry, and invariant failures.
3. Define readonly value objects and records for Project/Agent/Merchant/Policy, Money, settlement targets, PayIntent, PolicyDecision/checks, Approval request/decision/root, FundingPreparation, PaymentExecution/instruction/attempt, ExecutionProof/request, Ledger draft/journal/entries, AuditEvent, IdempotencyRecord, InboxEvent, DomainOutboxEvent, failure/expiry/cancellation evidence, PayRun, and transition bundles.
4. Ensure every aggregate root has `projectId`, `id`, `createdAt`, `updatedAt`, and integer `version`; immutable roots expose no mutation API.
5. Represent amounts only as canonical unsigned decimal strings plus decimals; never convert to JavaScript `number` for accounting or policy comparison.

## Task 2: Runtime schemas and serialization boundary

**Files:**

- Create: `src/features/payrun/domain/schemas.ts`
- Expand: `src/test/payrun/domain/schemas.test.ts`
- Create: `src/test/payrun/domain/serialization.test.ts`

1. Add failing tests for valid canonical input and rejection of floats, exponent notation, negative atomic amounts, invalid decimals, invalid ISO timestamps, unknown enums, malformed evidence, cross-project nested artifacts, and sandbox/live evidence confusion.
2. Implement dependency-free `RuntimeSchema<T>` parsers for every externally loaded canonical record and transition input.
3. Parse into new deeply frozen values so external object mutation cannot mutate canonical state.
4. Add `serializePayRun` and `deserializePayRun`; prove a canonical PayRun round trip preserves decimal strings, evidence, status, version, and project scope.
5. Reject unknown or missing required fields instead of filling demo defaults.

## Task 3: Pure invariants

**Files:**

- Create: `src/features/payrun/domain/invariants.ts`
- Create: `src/test/payrun/domain/invariants.test.ts`

1. Write failing tests for project mismatch, downstream artifacts on blocked/review states, payment without valid Funding, completion without each required stage, unbalanced Ledger, invalid Ledger sides, duplicated proof/external reference, unsafe Funding failure/cancellation, expired intent approval, and sandbox/live evidence mixing.
2. Implement reusable assertions for atomic amounts, UTC timestamps, project/PayRun lineage, evidence namespaces, accepted Funding status, Payment/Proof binding, balanced Ledger entries, terminal completion, and stage-specific absence.
3. Implement append-only helpers for AuditEvent and DomainOutboxEvent that require same project/aggregate, strictly monotonic sequence/version, and preserve the original collection.
4. Implement idempotency compatibility semantics: same scoped key and request hash reuses the durable record; a different hash fails with a stable conflict.
5. Keep all functions pure and free from clock, ID, storage, network, or framework dependencies.

## Task 4: Deterministic Policy and Approval-aware recheck semantics

**Files:**

- Create: `src/features/payrun/domain/policy-engine.ts`
- Create: `src/test/payrun/domain/policy-engine.test.ts`

1. Write failing tests for deterministic replay, stable reason ordering, hard-block precedence, uncovered review, Approval-covered unchanged reasons, new review reasons, hard block after Approval, invalid/expired Approval, and non-floating-point amount inputs.
2. Implement a deterministic pure evaluator over a server-resolved Policy snapshot and ordered check candidates.
3. Preserve stable reason codes and precedence; hard block always wins.
4. Allow a valid Approval context to consume only unchanged covered review reasons within the same scope digest; record the Approval decision as authorization basis.
5. Do not implement free-text parsing, repository reads, reservations, Approval commands, or side effects.

## Task 5: Single canonical state machine

**Files:**

- Create: `src/features/payrun/domain/state-machine.ts`
- Create: `src/test/payrun/domain/state-machine.test.ts`
- Create: `src/test/payrun/domain/scenarios.test.ts`
- Create: `src/test/payrun/domain/fixtures.ts`

1. Write the normative 20-state/43-edge table in tests first.
2. Add failing table-driven tests that call the public transition authority for all 43 legal edges and reject all other 357 state pairs, including terminal self-transitions.
3. Add failing tests for required stage evidence, mandatory `approved -> policy_evaluating` recheck, no downstream records for pending/blocked/denied/early-expired, intent/Approval expiry, conditional no-effect Funding/Payment failures, and terminal immutability.
4. Add failing tests proving `expectedVersion` conflicts emit no transition bundle, committed transitions increment PayRun version exactly once, creation starts at version 1, and direct returned values are frozen.
5. Implement `createPayRun` for the genesis `intent_recorded` state and `transitionPayRun` as the sole status-changing function. Export an immutable legal-transition table and `canTransition` query; do not export any status setter.
6. Each successful create/transition returns the PayRun plus project-scoped IdempotencyRecord, append-only AuditEvent, and immutable DomainOutboxEvent with before/after versions.
7. Add pure four-fixture traces for Allowed, Review approve/recheck/reject, Blocked, and Funding mismatch. Assert exact canonical sequences, required/forbidden artifacts, Sandbox labeling, `transactionHash=null`, `realFundsAvailable=false`, and no live evidence.

## Task 6: Explicit project-scoped application ports

**Files:**

- Create: `src/features/payrun/application/ports.ts`
- Create: `src/test/payrun/domain/ports.test.ts`

1. Write failing type/runtime contract tests with minimal test doubles.
2. Define project-scoped PayRun, Approval, FundingPreparation, PaymentExecution, Ledger, Audit, DomainOutbox, Inbox, and Idempotency repository ports.
3. Require `projectId` on every method. Require `expectedVersion` and, where applicable, `expectedStatus` on every mutable update/CAS method.
4. Define a project-scoped Unit of Work contract capable of committing the full immutable transition bundle; define Clock and ID ports and pure external service port contracts only where required by the domain.
5. Expose append/read operations for Audit and immutable Ledger/Outbox records; expose no update/delete operation for append-only evidence.
6. Implement no adapter or in-memory repository in production code.

## Task 7: Verification, review, and single-commit boundary

**Files:**

- Review every new file above.
- Do not modify any other file unless a Gate exposes a Slice 2-only defect.

1. Run targeted domain tests throughout red-green cycles.
2. Run `npm run test -- --run src/test/payrun/domain` and record file/test totals.
3. Run the complete Gate from a clean dependency install:
   - `npm ci`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
   - `npm run smoke`
4. Run an independent read-only code review against all Architecture/Product requirements; fix any Slice 2 issue and repeat affected/full Gates.
5. Confirm `git diff --name-only origin/main...HEAD` contains only the implementation plan and new PayRun domain/application/test files; confirm no legacy product behavior changed.
6. Stage the complete Slice 2 unit and create exactly one commit:

   ```text
   feat(payrun): establish canonical domain model
   ```

7. Verify the branch is one commit ahead of `origin/main`, the worktree is clean, and stop without pushing, opening a PR, or starting Slice 3.

## Required final evidence

- implementation plan path
- modified-file list
- canonical object list
- complete transition matrix
- invariant list
- test counts and command results
- all Gate results
- commit hash
- known limitations and deferred proofs
- explicit legacy/product behavior-change statement
- future PR plan: base `main`, head `codex/zenfix-slice-2-domain`
