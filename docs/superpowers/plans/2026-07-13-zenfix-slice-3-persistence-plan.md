# ZenFix Slice 3 Persistence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This Slice must finish as one commit and one Draft PR; do not create intermediate commits.

**Goal:** Give the canonical PayRun domain reliable, project-scoped persistence for the Local Development Sandbox through one checksummed Local JSON store, process-local serialization, single-writer cross-process protection, CAS, and atomic Unit of Work commits.

**Architecture:** A single canonical store file contains one normalized payload for every repository in `PayRunUnitOfWorkContext`. All adapter instances in one Node.js process that resolve to the same canonical store path share one coordinator, mutex, writer lease, and reference count. A mutation reads and validates the current envelope, changes an isolated memory working copy, validates the result, and replaces the store with one fsynced temporary file plus atomic rename. A sibling exclusive lock prevents a second process from becoming a writer; this is not a multi-process transaction system.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Node.js `crypto`, Node.js `os`, Vitest, existing Slice 2 domain types/runtime schemas, Next.js 14 toolchain.

## Global Constraints

- Base commit is `b83c4f2d59ef2ff8052bc2e8fd82f4bc2fee73ca` from `origin/main`.
- Branch is `codex/zenfix-slice-3-storage`.
- Authority is `docs/architecture/**` and `docs/product/**`.
- Modify only `src/features/payrun/adapters/storage/**`, `src/features/payrun/application/**`, `src/test/payrun/storage/**`, and `docs/superpowers/plans/**`.
- Do not modify `src/app/**`, legacy swap/execute, UI, API routes, payment rails, funding execution, Supabase, dependencies, or production configuration.
- Do not add Slice 4 control-loop behavior, budget reservations, Approval execution, Ledger orchestration, payment/funding execution, or real-funds behavior.
- Use test-driven development: every production behavior starts with a focused failing test whose failure is observed and explained.
- Local JSON is **Local Development Sandbox Persistence**. It is not a production database, distributed store, network-filesystem store, or multi-process transaction system.
- The Slice completes with exactly one commit: `feat(payrun): add local persistence layer`.

---

## 1. Architecture Mapping

This plan implements only requirements already accepted by the Architecture Baseline:

- Project-scoped repository operations and cross-project non-disclosure: [ARCHITECTURE.md §2 invariants 7–10](../../architecture/ARCHITECTURE.md#2-non-negotiable-architecture-invariants), [DOMAIN_MODEL.md §11](../../architecture/DOMAIN_MODEL.md#11-repository-contracts), and [ADR-0004](../../architecture/ADRs/0004-project-scope-cas-and-outbox.md).
- Monotonic aggregate CAS and no last-write-wins: [ARCHITECTURE.md §5](../../architecture/ARCHITECTURE.md#5-canonical-command-path), [DOMAIN_MODEL.md §2](../../architecture/DOMAIN_MODEL.md#2-aggregate-boundaries), and ADR-0004.
- Atomic `PayRun CAS + stage data + idempotency + AuditEvent + Domain OutboxEvent`: [ARCHITECTURE.md §9](../../architecture/ARCHITECTURE.md#9-consistency-and-delivery-semantics), [PAYRUN_STATE_MACHINE.md §5](../../architecture/PAYRUN_STATE_MACHINE.md#5-transition-protocol), and ADR-0004.
- Independent append-only Audit and Domain Outbox persistence: [DOMAIN_MODEL.md §10](../../architecture/DOMAIN_MODEL.md#10-ledger-audit-and-receipt) and ADR-0004.
- Explicit storage failure and no demo/local seed fallback: Architecture invariant 10 and ADR-0004 Failure Behavior.
- Slice 3 Gate: project isolation, CAS conflict, atomic state/audit/Domain-Outbox write, corruption, and no-fallback tests: [ARCHITECTURE.md §11](../../architecture/ARCHITECTURE.md#11-slice-and-gate-model).
- Sandbox/local-only posture and no real funding/payment authority: [ADR-0003](../../architecture/ADRs/0003-sandbox-first-execution.md) and [FUNDING_LAYER.md §2](../../architecture/FUNDING_LAYER.md#2-first-pilot-semantics).

Product validation documents remain non-authoritative for persistence. Research records are not written into PayRun Audit, Outbox, Proof, Ledger, or canonical state.

## 2. Explicit Non-Goals

Slice 3 does not implement:

- multiple processes jointly writing one store
- lock waiting, lock retry, or writer election
- heartbeat leases
- distributed locks or cross-machine stale-lock recovery
- write-ahead logging, journal replay, checkpointing, or journal recovery
- network filesystem support
- Supabase, Postgres, Hosted persistence, database migrations, or row-level security
- production recovery, PITR, RPO/RTO, or restore drills
- API, UI, routes, SDK surfaces, webhook HTTP delivery, or Receipt projections
- real payment, funding, swap, bridge, settlement, signer, or rail behavior
- Slice 4 control-loop orchestration

Hosted persistence is responsible for multi-process concurrency, database transactions, durable row-level CAS, row-level Project isolation, and production recovery. This adapter must not be described as providing those capabilities.

---

## 3. Store Contract

### 3.1 Canonical store path

`canonicalizeStorePath(storePath)` performs these steps:

1. `path.resolve(storePath)` to obtain an absolute candidate.
2. Split the candidate into parent directory and filename.
3. Resolve the parent with `fs.realpath(parentDirectory)`.
4. Join the real parent directory and unchanged filename.

The parent directory must already exist. Missing/unreadable parents produce an explicit `StorePathError`; the adapter does not create arbitrary directory trees. Resolving the parent before joining the filename means the store itself may legitimately be absent during first initialization while symlink/path aliases still converge on one coordinator key and one lock path.

`path.resolve` alone is forbidden as the coordination key.

### 3.2 Envelope and generation

The persisted document uses this exact public shape:

```ts
export const LOCAL_JSON_STORE_SCHEMA_VERSION = 1 as const;

export interface LocalJsonStorePayload {
  readonly payRuns: readonly PayRun[];
  readonly approvals: readonly Approval[];
  readonly fundingPreparations: readonly FundingPreparation[];
  readonly paymentExecutions: readonly PaymentExecution[];
  readonly ledgerJournals: readonly LedgerJournal[];
  readonly auditEvents: readonly AuditEvent[];
  readonly domainOutboxEvents: readonly DomainOutboxEvent[];
  readonly idempotencyRecords: readonly IdempotencyRecord[];
  readonly inboxEvents: readonly InboxEvent[];
}

export interface LocalJsonStoreEnvelopeContent {
  readonly schemaVersion: typeof LOCAL_JSON_STORE_SCHEMA_VERSION;
  readonly storeGeneration: number;
  readonly writtenAt: string;
  readonly payload: LocalJsonStorePayload;
}

export interface LocalJsonStoreEnvelope extends LocalJsonStoreEnvelopeContent {
  readonly envelopeChecksum: string;
}
```

`envelopeChecksum` is SHA-256 lowercase hexadecimal over the canonical serialized `LocalJsonStoreEnvelopeContent`. It covers `schemaVersion`, `storeGeneration`, `writtenAt`, and the complete `payload`; only `envelopeChecksum` itself is excluded.

`storeGeneration` rules:

- First initialization persists an empty valid envelope at generation **0**.
- Each successful standalone mutation or Unit of Work commit increments generation exactly once.
- Reads do not increment it.
- CAS conflict, project-scope rejection, duplicate append, validation failure, checksum failure, pre-rename I/O failure, fsync failure before rename, and rename failure do not increment the formal store.
- The value must be a non-negative safe integer.
- A commit at `Number.MAX_SAFE_INTEGER` fails with `StoreGenerationOverflowError`; it never wraps or writes an unsafe value.

### 3.3 First initialization versus corruption

After obtaining the writer lease:

- If reading the exact formal store path returns `ENOENT`, create the empty generation-0 envelope through the same atomic-write pipeline used by normal commits.
- This is explicit first initialization, not seed fallback. The payload contains only empty collections and no demo records.
- If the formal store exists, malformed JSON, unsupported schema version, checksum mismatch, invalid envelope fields, or invalid canonical domain records always fail explicitly.
- Existing invalid stores are never deleted, overwritten, repaired, or replaced with an empty envelope.
- Sibling temporary files are ignored. They are neither a store nor an automatic recovery source.

### 3.4 Canonical JSON

`canonicalStringify(value)` must:

- recursively sort object keys by Unicode code-point order
- retain array order exactly
- serialize only `null`, booleans, strings, finite numbers, arrays, and plain string-keyed objects
- reject `undefined`, `BigInt`, functions, symbols, `NaN`, positive/negative infinity, sparse arrays, non-plain objects, symbol keys, and cyclic references
- reject values whose `toJSON` behavior would change the contract
- never use ordinary object insertion order as the canonical contract

The serializer may use `JSON.stringify` only after it has recursively constructed and validated a key-sorted canonical value. `canonicalClone` is defined as parse of `canonicalStringify` and is used to isolate caller-owned values and Unit of Work working copies.

---

## 4. Concurrency and Writer Lease

### 4.1 Process-local coordinator

The module owns one registry:

```ts
const coordinators = new Map<string, SharedStoreCoordinator>();
```

The key is the canonical store path. `SharedStoreCoordinator` owns:

- canonical store path and sibling lock path
- one `instanceId` representing the process-local writer lease owner
- one promise-tail mutex/queue
- reference count
- lease metadata
- filesystem and clock dependencies
- closed/released state

Opening another adapter for the same canonical path in the same process increments the reference count and returns a handle backed by the same coordinator. It does not create a second physical lock or a private mutex.

Every adapter handle tracks its own `closed` state. Any repository, read, mutation, or Unit of Work call after that handle closes throws `AdapterClosedError`.

Closing a non-final handle decrements the reference count only. Closing the final handle verifies lock ownership, releases only its own lock, marks the coordinator released, and removes the registry entry. Abnormal process exit relies on stale-lock recovery; the design does not claim that `close()` always runs.

### 4.2 Cross-process single-writer lease

The lock file is a sibling of the store and is created with exclusive `wx` semantics. Metadata has this exact minimum shape:

```ts
export interface WriterLeaseMetadata {
  readonly pid: number;
  readonly hostname: string;
  readonly instanceId: string;
  readonly createdAt: string;
  readonly canonicalStorePath: string;
}
```

Acquisition behavior:

- The first process creates and fsyncs the lock file before initialization or mutation.
- A second process receives `StoreLockedError` immediately. It does not wait or retry.
- A lock is reclaimable only when metadata is valid, `hostname === os.hostname()`, and `process.kill(pid, 0)` fails specifically with `ESRCH`.
- `EPERM` means the PID cannot be proven dead and fails closed.
- A foreign hostname, malformed metadata, invalid PID, unreadable lock, uncertain ownership, or unexpected process probe error fails closed with `StoreLockedError`.
- A proven stale lock is atomically renamed to an operation-owned sibling quarantine name before a new exclusive acquisition is attempted. The quarantined metadata and file identity must still match the inspected stale lock; any replacement/race ambiguity fails closed. Direct unconditional unlink of the active lock path is forbidden.
- Reclaim checks and exclusive acquisition remain serialized by the process-local coordinator. If another process wins the race, exclusive creation fails and the caller returns `StoreLockedError`.
- Existing locks are never unconditionally unlinked.
- Failure while writing or fsyncing a newly acquired lock releases it only after re-reading and confirming the same `instanceId` and canonical path, then propagates the lock I/O error without touching the store.

### 4.3 Ownership verification and lease loss

Before every standalone mutation and before the commit phase of every Unit of Work, `assertWriterLeaseOwned()` reopens and validates the current lock file:

- the lock exists
- metadata is valid
- `instanceId` equals the coordinator instance
- `canonicalStorePath` equals the coordinator canonical path
- PID and hostname equal the owning process

A missing or replaced lock throws `LeaseLostError`. No temporary store file is opened and no formal store write occurs after lease loss.

Final close reads the lock and removes it only when `instanceId`, PID, hostname, and canonical path all match. If ownership was lost, close leaves the foreign/missing lock untouched, removes only the local registry handle state, and reports `LeaseLostError`.

---

## 5. Atomic Persistence and Durability Semantics

Each write uses a temporary filename in the formal store directory:

```text
.<store filename>.tmp.<instanceId>.<operationId>
```

The operation ID is unique per attempted write. The adapter records the exact temporary path it created and may clean up only that path.

Commit order:

1. Validate writer lease ownership.
2. Validate the memory working copy and next safe generation.
3. Build `LocalJsonStoreEnvelopeContent` with injected UTC `writtenAt`.
4. Generate `envelopeChecksum` from canonical content.
5. Canonically serialize the complete envelope.
6. Open the unique sibling temporary file with exclusive create.
7. Write all bytes and verify the complete buffer was written.
8. `fsync` the temporary file.
9. Close the temporary file.
10. Revalidate writer lease ownership immediately before rename.
11. Atomic rename temporary path to formal store path.
12. Open and `fsync` the parent directory when supported.

Failure semantics:

- Any failure before successful rename leaves the formal store unchanged and generation unadvanced. The adapter attempts to unlink only its own temporary file and propagates the original explicit error.
- Rename failure leaves the original formal store intact and removes only the operation's own temporary file when possible.
- Successful rename is the logical file-content commit point. A later parent-directory fsync failure cannot be described as rolled back because the replacement may already be visible.
- Explicit platform errors indicating directory fsync is unsupported (`EINVAL`, `ENOTSUP`, or `EISDIR` for the directory operation only) are recorded through the injected diagnostic sink and the committed operation returns successfully.
- Any other parent-directory fsync error produces `StoreDurabilityError` with `commitState: "renamed_not_durably_confirmed"` and the committed generation. The new file remains the authoritative visible store, but crash durability is not claimed. Callers must inspect/reload before deciding whether to issue another logical command.
- Other I/O errors propagate as `AtomicStoreWriteError` with operation stage and path metadata.
- Startup never scans or promotes temporary files.

The plan claims atomic visibility through same-directory rename. It does not claim database durability or cross-process transactions.

To test every failure without test-only production methods, filesystem operations are injected through a narrow internal `LocalJsonFileSystem` interface whose production implementation delegates to `node:fs/promises`.

---

## 6. Read Validation and Explicit Errors

Read order is fixed:

1. Read only the formal canonical store path.
2. Parse JSON; syntax failure throws `StoreCorruptionError` with reason `malformed_json`.
3. Validate envelope object keys and primitive shapes.
4. Reject unknown `schemaVersion` with `UnsupportedStoreSchemaVersionError`.
5. Validate generation as a non-negative safe integer and `writtenAt` as UTC ISO-8601.
6. Recompute the checksum over canonical content and constant-time compare it with `envelopeChecksum`; mismatch throws `StoreCorruptionError` with reason `checksum_mismatch`.
7. Parse every collection through the existing canonical runtime schemas where available and storage-local exact schemas for infrastructure records not exported by Slice 2.
8. Revalidate collection uniqueness, project/ID identity, append-only sequence constraints, aggregate invariants, and cross-record indexes.

Invalid domain data throws `StoreCorruptionError` with reason `runtime_schema_invalid`, preserving the underlying safe validation code but not silently removing records.

Public storage errors:

```ts
StorePathError
StoreLockedError
LeaseLostError
AdapterClosedError
StoreCorruptionError
UnsupportedStoreSchemaVersionError
StoreGenerationOverflowError
AtomicStoreWriteError
StoreDurabilityError
DuplicateRecordError
AppendOnlyViolationError
```

Existing `VersionConflictError` and `ProjectScopeError` remain the canonical CAS/scope errors. Error objects contain stable codes and safe metadata; they do not include full stored payloads.

---

## 7. Repository and Unit of Work Design

### 7.1 Existing application contracts

`src/features/payrun/application/ports.ts` already defines every required repository and `PayRunUnitOfWork`. Slice 3 implements those interfaces without changing their public method signatures. No application-port edit is planned unless implementation reveals a compile-time contradiction with an accepted Architecture requirement; such a contradiction is an Architecture blocker and must stop implementation rather than be silently redesigned.

The adapter exports:

```ts
export interface LocalJsonPayRunStorageOptions {
  readonly storePath: string;
  readonly now?: () => string;
  readonly nextOperationId?: () => string;
  readonly diagnostics?: LocalJsonStorageDiagnostics;
}

export interface LocalJsonStorageDiagnostics {
  directoryFsyncUnsupported(details: {
    readonly canonicalStorePath: string;
    readonly code: "EINVAL" | "ENOTSUP" | "EISDIR";
  }): void;
}

export interface LocalJsonPayRunStorage {
  readonly canonicalStorePath: string;
  readonly payRuns: PayRunRepository;
  readonly approvals: ApprovalRepository;
  readonly fundingPreparations: FundingPreparationRepository;
  readonly paymentExecutions: PaymentExecutionRepository;
  readonly ledger: LedgerRepository;
  readonly auditEvents: AuditEventRepository;
  readonly domainOutbox: DomainOutboxRepository;
  readonly idempotency: IdempotencyRepository;
  readonly inbox: InboxEventRepository;
  readonly unitOfWork: PayRunUnitOfWork;
  getStoreGeneration(): Promise<number>;
  close(): Promise<void>;
}

export function openLocalJsonPayRunStorage(
  options: LocalJsonPayRunStorageOptions,
): Promise<LocalJsonPayRunStorage>;
```

The first coordinator for a canonical path generates a non-empty process-local `instanceId` with Node `crypto.randomUUID()`. Later adapter handles for the same path attach to that coordinator and do not choose a second lease identity. Focused tests inject deterministic clock, operation-ID, instance-ID, process-probe, and filesystem dependencies through an internal factory that is not exported from `index.ts`; the public open contract exposes no lock-identity override.

### 7.2 Project scope and identity

- Collections are persisted as arrays but indexed in memory by composite keys such as `projectId + "\u0000" + id`.
- `get` and lookup methods search only inside the requested project. An ID existing in another project returns `null`.
- Every insert/append verifies `record.projectId === projectId`; mismatch throws `ProjectScopeError` before mutation.
- Duplicate project-scoped identity throws `DuplicateRecordError` and commits nothing.
- Returned values are canonical clones; callers cannot mutate adapter memory or later persisted values.

### 7.3 CAS

Mutable repository CAS validates inside one coordinator critical section:

- exact project-scoped aggregate identity
- exact `expectedVersion`
- existing expected status/state where the port includes it
- `next.projectId` and `next.id` unchanged
- `next.version === expectedVersion + 1`
- immutable creation identity retained
- next record passes its canonical runtime schema and domain invariants

Missing/cross-project records are not found. A stale version or status throws `VersionConflictError`; it does not return an updated result, write Audit/Outbox, or increment generation. Successful CAS returns `{ kind: "updated", value }` to satisfy the existing port type.

Two adapter instances racing with the same expected version share the same queue. One commits; the second reloads the new envelope inside its later critical section and throws `VersionConflictError`. Therefore no lost update occurs and generation advances once.

### 7.4 Append-only collections

- Audit uniqueness is `(projectId, aggregateType, aggregateId, sequence)` plus event ID. Sequence must extend the persisted PayRun audit lineage; no update/delete API exists.
- Domain Outbox uniqueness is `(projectId, eventId)` plus `(projectId, aggregateType, aggregateId, sequence)`. Aggregate version, sequence, identity, schema version, and payload remain immutable; no delivery state is added in Slice 3.
- Ledger journals are append-only and retain existing proof/external-reference uniqueness.
- Duplicate append fails the whole operation with `AppendOnlyViolationError` or the existing Ledger invariant error.

### 7.5 Unit of Work

`unitOfWork.execute(projectId, operation)` performs:

1. Reject a closed adapter.
2. Enter the shared canonical-path queue.
3. Verify writer lease ownership.
4. Read and validate the latest formal envelope.
5. Create a canonical deep working copy in memory.
6. Create transaction-bound repository implementations over that working copy. They never enter the coordinator queue and never touch disk.
7. Execute `operation(context)`.
8. Validate all working-copy collections and project scope.
9. Reverify writer lease ownership.
10. Persist one next-generation envelope through one atomic replacement.
11. Return the operation result only after the commit outcome is known.

The transaction context accepts operations only for the `projectId` supplied to `execute`; any repository call with another project throws `ProjectScopeError`.

If repository operation, CAS, validation, Audit append, Outbox append, checksum generation, temporary write, temporary fsync, or pre-rename stage fails, the memory copy is discarded and the formal store remains unchanged. The post-rename directory-fsync uncertainty follows the explicit `StoreDurabilityError` semantics in §5.

Standalone mutations call the same internal transaction primitive with one repository action, so they are single-operation Units of Work and increment generation once on success.

---

## 8. Planned Implementation Files

### Production adapter files

- Create `src/features/payrun/adapters/storage/errors.ts` — stable explicit storage errors and safe metadata.
- Create `src/features/payrun/adapters/storage/canonical-json.ts` — canonical value validation, sorting, serialization, clone, and SHA-256 checksum input.
- Create `src/features/payrun/adapters/storage/store-envelope.ts` — envelope types, empty payload, checksum, read parsing, runtime schema validation, generation validation, and collection invariants.
- Create `src/features/payrun/adapters/storage/local-json-file-system.ts` — narrow filesystem contract, Node implementation, and atomic replacement stages.
- Create `src/features/payrun/adapters/storage/writer-lease.ts` — lock metadata, exclusive acquisition, same-host dead-PID recovery, ownership verification, and guarded release.
- Create `src/features/payrun/adapters/storage/coordinator.ts` — canonical-path registry, shared queue, reference count, adapter-handle lifecycle, and transaction primitive.
- Create `src/features/payrun/adapters/storage/repositories.ts` — public and transaction-bound implementations of the existing repository ports.
- Create `src/features/payrun/adapters/storage/local-json-storage.ts` — public open API and storage handle composition.
- Create `src/features/payrun/adapters/storage/index.ts` — explicit public exports only.

### Test files

- Create `src/test/payrun/storage/fixtures.ts` — valid canonical store/domain fixtures and deterministic envelope builders.
- Create `src/test/payrun/storage/canonical-json.test.ts` — canonical serializer and checksum contract.
- Create `src/test/payrun/storage/store-envelope.test.ts` — initialization, generation, schema, checksum, and corruption behavior.
- Create `src/test/payrun/storage/writer-lease.test.ts` — lock acquisition, stale recovery, lease loss, guarded close, and cross-process fail-fast.
- Create `src/test/payrun/storage/lease-holder.test.ts` — environment-gated child-process fixture that opens the real adapter, signals readiness, and holds the writer lease until released.
- Create `src/test/payrun/storage/atomic-write.test.ts` — injected filesystem failures, temp-file rules, rename boundary, and directory-fsync semantics.
- Create `src/test/payrun/storage/repositories.test.ts` — save/load, project isolation, restart, CAS, concurrent multi-instance behavior, append-only Audit, and Outbox.
- Create `src/test/payrun/storage/unit-of-work.test.ts` — all-or-nothing PayRun/Audit/Outbox/idempotency transactions and generation behavior.

### Documentation

- This file is the Slice 3 design, Architecture mapping, detailed TDD implementation plan, and concurrency boundary record.

No product or test file is modified during the planning stage.

---

## 9. Detailed TDD Execution Plan

### Task 1: Canonical JSON and full-envelope checksum

**Files:**

- Create: `src/features/payrun/adapters/storage/canonical-json.ts`
- Test: `src/test/payrun/storage/canonical-json.test.ts`

**Produces:** `canonicalStringify`, `canonicalClone`, and `sha256Canonical`.

- [ ] Write failing tests proving differently inserted object keys serialize identically, nested keys sort recursively, arrays retain order, and all forbidden JSON values are rejected.
- [ ] Write a failing test proving checksum input changes when any of `schemaVersion`, `storeGeneration`, `writtenAt`, or `payload` changes.
- [ ] Run `npm run test -- src/test/payrun/storage/canonical-json.test.ts`; confirm failure because the module is absent.
- [ ] Implement the minimal recursive canonical-value validator/sorter and SHA-256 helper without adding a dependency.
- [ ] Re-run the focused test and confirm all cases pass.

Representative contract test:

```ts
expect(canonicalStringify({ z: 1, nested: { b: 2, a: 1 } }))
  .toBe('{"nested":{"a":1,"b":2},"z":1}');
expect(() => canonicalStringify({ amount: 1n })).toThrow(NonCanonicalJsonError);
```

### Task 2: Envelope parsing, initialization, corruption, and generation

**Files:**

- Create: `src/features/payrun/adapters/storage/store-envelope.ts`
- Create: `src/features/payrun/adapters/storage/errors.ts`
- Create: `src/test/payrun/storage/fixtures.ts`
- Test: `src/test/payrun/storage/store-envelope.test.ts`

**Consumes:** canonical serialization/checksum helpers and existing domain runtime schemas.

**Produces:** generation-0 empty envelope builder, verified envelope parser, and working-copy validator.

- [ ] Write failing tests for the exact generation-0 empty payload and full-envelope checksum.
- [ ] Write failing tests for malformed JSON, unsupported schema version, checksum mismatch, unsafe generation, generation overflow, unexpected envelope keys, and invalid nested PayRun/Audit/Outbox records.
- [ ] Verify the focused tests fail because envelope parsing is absent.
- [ ] Implement strict envelope parsing in the order defined in §6 and wrap nested schema failures as `StoreCorruptionError(runtime_schema_invalid)`.
- [ ] Implement `nextStoreGeneration` with safe-integer and overflow enforcement.
- [ ] Re-run focused tests and existing `src/test/payrun/domain/serialization.test.ts` to confirm storage parsing preserves canonical domain round trips.

Representative corruption assertion:

```ts
expect(() => parseStoreEnvelope(tamperedText)).toThrowError(
  expect.objectContaining({ code: "store_corrupt", reason: "checksum_mismatch" }),
);
```

### Task 3: Canonical path and single-writer lease

**Files:**

- Create: `src/features/payrun/adapters/storage/writer-lease.ts`
- Test: `src/test/payrun/storage/writer-lease.test.ts`
- Test fixture: `src/test/payrun/storage/lease-holder.test.ts`

**Produces:** canonical path resolution, lock acquisition, ownership assertion, stale recovery, and guarded release.

- [ ] Write failing path tests proving two symlink-parent aliases yield the same canonical store/lock path and a missing or unreadable parent throws `StorePathError` without creating a lock.
- [ ] Write failing tests for exclusive acquisition, same-host dead PID recovery, active PID fail-fast, `EPERM` fail-closed, foreign-host fail-closed, invalid metadata fail-closed, and an unreadable lock.
- [ ] Write failing tests proving deleted/replaced lock causes `LeaseLostError` before mutation and final close never deletes another instance's lock.
- [ ] Add the environment-gated child Vitest fixture that opens the actual adapter in a separate process, signals readiness via an IPC/marker path, and releases on an explicit parent signal.
- [ ] Run the focused test; confirm failure because lease handling is absent.
- [ ] Implement exclusive `wx` acquisition and only the approved same-host `ESRCH` stale recovery.
- [ ] Implement ownership verification before mutation/commit and guarded ownership-aware release.
- [ ] Re-run the focused tests, including the real child-process holder/second-writer case; confirm the second process receives `StoreLockedError` immediately and the store bytes remain unchanged.

### Task 4: Atomic file replacement and durability boundary

**Files:**

- Create: `src/features/payrun/adapters/storage/local-json-file-system.ts`
- Test: `src/test/payrun/storage/atomic-write.test.ts`

**Produces:** injectable filesystem port and same-directory atomic replacement.

- [ ] Write failing tests that capture the order `open temp → write complete → fsync temp → close → lease recheck → rename → fsync directory`.
- [ ] Write failing tests for partial/temp write failure, temp fsync failure, rename failure, supported directory-fsync failure, unsupported directory-fsync diagnostic, and own-temp cleanup.
- [ ] Assert every pre-rename failure preserves byte-for-byte original store contents and does not advance generation.
- [ ] Assert a foreign or old temporary file is ignored and never removed or promoted.
- [ ] Assert a post-rename non-platform directory-fsync failure throws `StoreDurabilityError(commitState="renamed_not_durably_confirmed")` while the newly renamed complete envelope remains readable.
- [ ] Run the focused test and observe the missing implementation failure.
- [ ] Implement the minimum atomic writer with an operation-owned temporary path and explicit stage errors.
- [ ] Re-run focused tests and confirm all commit-boundary assertions pass.

### Task 5: Shared coordinator, initialization, restart, and lifecycle

**Files:**

- Create: `src/features/payrun/adapters/storage/coordinator.ts`
- Create: `src/features/payrun/adapters/storage/local-json-storage.ts`
- Create: `src/features/payrun/adapters/storage/index.ts`
- Test: `src/test/payrun/storage/repositories.test.ts`
- Test: `src/test/payrun/storage/writer-lease.test.ts`

**Produces:** `openLocalJsonPayRunStorage`, shared canonical-path queue, reference counting, first initialization, and close behavior.

- [ ] Write a failing test proving `ENOENT` initializes one empty generation-0 envelope after lease acquisition.
- [ ] Write a failing test proving an existing corrupt store is never reinitialized or overwritten.
- [ ] Write a failing test opening two adapter instances through symlink/path aliases and proving they share one coordinator/physical lease.
- [ ] Write failing reference-count tests: first close retains the lease, final close removes only the owned lease, and every call after handle close throws `AdapterClosedError`.
- [ ] Write a failing restart test: close the final adapter, reopen a new adapter instance, and load the previously persisted envelope without seed data.
- [ ] Run focused tests and confirm expected missing-open/coordinator failures.
- [ ] Implement registry lookup, shared promise-tail serialization, reference counts, initialization, restart read, and handle lifecycle.
- [ ] Re-run focused tests and confirm no private per-instance lock permits a lost update.

### Task 6: Project-scoped repositories and CAS

**Files:**

- Create: `src/features/payrun/adapters/storage/repositories.ts`
- Test: `src/test/payrun/storage/repositories.test.ts`

**Consumes:** existing repository interfaces from `application/ports.ts`, coordinator transactions, and canonical domain schemas/invariants.

**Produces:** all repositories in `PayRunUnitOfWorkContext` for standalone and transaction-bound use.

- [ ] Write a failing save/load PayRun test and prove returned/caller-owned objects cannot mutate persisted state.
- [ ] Write failing project-isolation tests for every repository lookup and insert/append mismatch.
- [ ] Write failing CAS tests for exact expected version, expected state, identity retention, version +1, and canonical validation.
- [ ] Write the two-instance concurrent CAS test: both start with expected version 1; exactly one resolves updated, the other rejects with `VersionConflictError`; persisted version is 2 and generation advances once.
- [ ] Write a second concurrent test with different sequential expected versions to prove two valid queued updates both persist in order and generation advances twice.
- [ ] Run focused tests and confirm failures because repositories are absent.
- [ ] Implement cloned project-scoped reads, inserts, lookups, and CAS entirely inside the coordinator/working-copy transaction primitives.
- [ ] Re-run focused repository tests and existing domain port type tests.

### Task 7: Append-only Audit, Domain Outbox, Ledger, and infrastructure records

**Files:**

- Modify: `src/features/payrun/adapters/storage/repositories.ts`
- Test: `src/test/payrun/storage/repositories.test.ts`

**Produces:** durable independent append collections with existing project-scoped uniqueness.

- [ ] Write failing Audit tests for persisted ordering, monotonic sequence, duplicate ID, duplicate aggregate sequence, and attempted replacement through duplicate append.
- [ ] Write failing Domain Outbox tests for restart persistence, duplicate event ID, duplicate aggregate sequence, aggregate version/payload validation, and project isolation.
- [ ] Write failing Ledger uniqueness tests by proof and external reference.
- [ ] Write failing idempotency and inbox insert/CAS tests using their exact project-scoped identities.
- [ ] Run focused tests and observe the append/lookup failures.
- [ ] Implement minimum append-only collections and indexes; expose no update/delete path for Audit or Domain Outbox.
- [ ] Re-run focused tests and domain invariant tests.

### Task 8: Unit of Work all-or-nothing commit

**Files:**

- Modify: `src/features/payrun/adapters/storage/coordinator.ts`
- Modify: `src/features/payrun/adapters/storage/repositories.ts`
- Test: `src/test/payrun/storage/unit-of-work.test.ts`

**Produces:** existing `PayRunUnitOfWork` implemented over one memory working copy and one atomic replacement.

- [ ] Write a failing success test that commits PayRun CAS, idempotency result, AuditEvent, and Domain OutboxEvent together and advances generation once.
- [ ] Write table-driven failing rollback tests injecting failure at repository operation, CAS, runtime validation, Audit append, Outbox append, checksum, temp write, temp fsync, and rename.
- [ ] For every pre-rename row, assert formal store bytes, PayRun version, Audit list, Outbox list, idempotency record, and generation are unchanged.
- [ ] Write a failing test proving a transaction context cannot access another project.
- [ ] Write a failing test proving lease replacement after operation execution but before commit prevents every write.
- [ ] Run focused tests and confirm the Unit of Work currently has no implementation.
- [ ] Implement transaction-bound repositories on a cloned payload and perform exactly one validated commit after the callback succeeds.
- [ ] Re-run focused tests and confirm all-or-nothing behavior.

### Task 9: Full test matrix and fixed Gate

**Files:**

- Modify only storage test files if a missing Architecture-mapped case is found.
- Do not change behavior merely to silence a Gate unrelated to Slice 3.

- [ ] Run all storage tests: `npm run test -- src/test/payrun/storage`.
- [ ] Run domain regressions: `npm run test -- src/test/payrun/domain`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run smoke`.
- [ ] Confirm all temporary test directories/processes are stopped and removed by their owning tests.
- [ ] Confirm Git scope contains only approved Slice 3 paths.
- [ ] Create exactly one commit: `feat(payrun): add local persistence layer`.
- [ ] Push `codex/zenfix-slice-3-storage` and create a Draft PR with base `main`.
- [ ] Stop after Slice 3; do not begin Slice 4.

---

## 10. Required TDD Test Matrix

| Area | Required test and expected result |
| --- | --- |
| First initialization | Absent formal store plus acquired lease creates empty schema-v1 generation-0 envelope; no seed records |
| Restart | Close final handle, reopen, and load exact PayRun/Audit/Outbox state and generation |
| Same-process instances | Two adapters resolving to one canonical path share coordinator, queue, lease, and reference count |
| Concurrent CAS | One of two stale concurrent writers succeeds, the other throws `VersionConflictError`; no lost update |
| Cross-process writer | Child process holds real adapter lease; second process fails immediately with `StoreLockedError`; bytes unchanged |
| Stale lock | Same-host metadata with a PID proven absent by `ESRCH` is recoverable |
| Uncertain lock | `EPERM`, foreign hostname, malformed metadata, unreadable lock, and unexpected probe errors fail closed |
| Lease loss | Missing/replaced lock before mutation or commit throws `LeaseLostError`; no temp/formal write |
| Guarded close | Final close never deletes a lock owned by another instance/process |
| Malformed JSON | Explicit `StoreCorruptionError(malformed_json)`; no initialization |
| Checksum mismatch | Explicit `StoreCorruptionError(checksum_mismatch)`; no repair |
| Unsupported schema | Explicit `UnsupportedStoreSchemaVersionError`; no overwrite |
| Invalid domain payload | Explicit `StoreCorruptionError(runtime_schema_invalid)` from canonical schemas/invariants |
| Generation success | Each successful standalone mutation or whole Unit of Work increments once |
| Generation failure | CAS/validation/pre-rename write failure leaves formal generation unchanged |
| Generation limit | `Number.MAX_SAFE_INTEGER` commit throws overflow error and does not write |
| Temp write failure | Original store remains byte-complete; only operation-owned temp is cleaned |
| Temp fsync failure | Original store remains byte-complete and generation unchanged |
| Rename failure | Original store remains intact; new temp is not promoted |
| Directory fsync unsupported | Only approved platform codes emit diagnostic and return committed success |
| Directory fsync other error | Explicit post-rename durability-uncertain error; new complete file remains visible |
| Temp isolation | Old/foreign temporary files are ignored as stores and recovery sources |
| Project isolation | Every repository hides cross-project IDs and rejects mismatched records |
| PayRun persistence | Save/load preserves canonical runtime-schema round trip |
| Audit append-only | Restart preserves order; duplicate ID/sequence and replacement attempts fail atomically |
| Outbox append-only | Restart preserves immutable event; duplicate ID/aggregate sequence fails atomically |
| Unit of Work success | PayRun/idempotency/Audit/Outbox persist through one generation and one rename |
| Unit of Work rollback | Every pre-rename failure leaves every collection and formal bytes unchanged |
| Closed handles | Every operation after close fails explicitly |

## 11. Public Contract Coverage

| Public contract | Test location |
| --- | --- |
| `openLocalJsonPayRunStorage` and generation-0 initialization | `repositories.test.ts` |
| `canonicalStorePath` alias convergence | `writer-lease.test.ts` |
| Every repository property | `repositories.test.ts` |
| `PayRunUnitOfWork.execute` | `unit-of-work.test.ts` |
| `getStoreGeneration` | `store-envelope.test.ts`, `unit-of-work.test.ts` |
| `close` and post-close behavior | `writer-lease.test.ts` |
| canonical serializer/checksum | `canonical-json.test.ts` |
| envelope schema and corruption errors | `store-envelope.test.ts` |
| writer lease and stale recovery | `writer-lease.test.ts`, `lease-holder.test.ts` |
| atomic replacement and durability errors | `atomic-write.test.ts` |
| CAS/version behavior | `repositories.test.ts` |
| Audit/Outbox append-only behavior | `repositories.test.ts`, `unit-of-work.test.ts` |

## 12. Implementation Stop Conditions

Stop and request an Architecture decision if implementation would require:

- changing canonical domain state or evidence semantics
- changing accepted repository/UoW signatures in a way that breaks Slice 2 contracts
- weakening project scope, CAS, Audit, Domain Outbox, or corruption behavior
- introducing a WAL/journal recovery protocol or claiming multi-process transactions
- touching forbidden paths, dependencies, Supabase/Postgres, API/UI, production configuration, or real funding/payment

No blocker is currently known. The defined Local Development Sandbox boundary is implementable with the existing Node.js toolchain and Slice 2 contracts.
