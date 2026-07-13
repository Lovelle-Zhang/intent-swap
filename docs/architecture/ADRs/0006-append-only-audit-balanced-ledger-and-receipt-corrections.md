# ADR-0006: Independent Append-Only Audit, Balanced Ledger, and Versioned Receipt Corrections

**Status:** PROPOSED
**Date:** 2026-07-13
**Owner:** ZenFix Architecture, Data, and Security

## 1. Status

This decision is **PROPOSED**. It does not authorize Slice 4 implementation or accept any live accounting claim. Human acceptance is required before Slice 4 implements Ledger completion. Receipt details defined here are an architectural contract for later Slice 7 work, not permission to implement Receipt/Webhook/Export in Slice 4.

## 2. Context

The ADR register requires a decision for “append-only audit, balanced Ledger, and Receipt corrections” before Slice 4 Ledger implementation, with Receipt details finalized before the Slice 7 Gate.

The Accepted Architecture already requires:

- independent append-only AuditEvents with Project/aggregate sequence uniqueness, authenticated actor, before/after versions, stable action/reason codes, correlation/idempotency IDs, database time, and redaction;
- a Project-scoped immutable `LedgerJournal` with integer-atomic balanced debit/credit entries, uniqueness by verified proof/external reference, and atomic commit with `ledger_recording → completed`;
- immutable persisted Receipt snapshots with separate receipt and schema versions, canonical content hash, Sandbox watermark, append-only corrections through `supersedesVersion`, and historical reads from stored versions;
- independent Domain Outbox records committed with originating operations; and
- Receipt creation as an idempotent projection that cannot change or roll back a Payment/Ledger outcome.

The remaining decision is how those three record classes remain distinct, how append-only behavior is enforced in Local Sandbox and future Hosted storage, what exactly commits together, how duplicate journals and corrections resolve, which Sandbox accounts/evidence are permitted, and how recovery behaves when Ledger or Receipt persistence fails.

This ADR blocks the Slice 4 behavior `proof_collected → ledger_recording → completed`. It also fixes the Receipt version/correction contract that Slice 7 must later implement without changing the Slice 4 payment result.

## 3. Decision drivers

- Preserve an immutable explanation history without treating Audit as accounting.
- Prevent an unbalanced, duplicated, overwritten, or cross-Project Ledger journal.
- Ensure `completed` is impossible before the balanced journal commits.
- Preserve historical Receipt bytes/meaning even when later corrections exist.
- Make retries deterministic and distinguish an identical replay from conflicting evidence.
- Allow Receipt projection failure and retry without changing a committed financial outcome.
- Keep Sandbox accounting visibly simulated and isolated from any live account/evidence namespace.
- Map cleanly from Local Development Sandbox Persistence to database-enforced Hosted persistence.

## 4. Options considered

| Option | Correctness and consistency | Concurrency and idempotency | Failure recovery and auditability | Slice 4 complexity | Hosted/Postgres migration |
| --- | --- | --- | --- | --- | --- |
| **A. Three independent authorities: append-only Audit, balanced Journal/Entries, immutable versioned Receipt projection** | Strong separation of explanation, accounting, and human-readable evidence | Strong Project-scoped uniqueness, immutable hashes, atomic Ledger completion, versioned Receipt append | Explicit recovery per subsystem; no history rewrite | Moderate and aligned with existing domain | Direct mapping to append-only tables, constraints, roles, and projection workers |
| **B. One event-sourced log as the source of PayRun, Audit, Ledger, and Receipt state** | Potentially strong with a complete event-sourcing design | Requires global ordering, projection offsets, replay compatibility, and correction protocols | Powerful replay, but large operational and migration surface | Excessive and redefines the accepted persistence model | High initial cost; useful only after a separate architecture decision |
| **C. Embed Audit arrays, Ledger fields, and latest Receipt inside mutable PayRun storage** | Weak: histories can be replaced and responsibilities are conflated | Weak cross-record uniqueness and correction races | Poor forensic history and difficult partial-failure diagnosis | Superficially low | Requires later extraction and trust remediation |

Option B is not recommended because it replaces rather than completes the accepted aggregate/CAS/Unit of Work model. Option C is not recommended because it contradicts the independent append-only and immutable-record requirements and makes a saved aggregate capable of rewriting history.

## 5. Recommended decision

Adopt **Option A**.

AuditEvent, LedgerJournal/Entries, and Receipt are separate persisted authorities linked by Project, PayRun, versions, and evidence hashes:

- Audit explains who did what and why.
- Ledger records the balanced simulated or future guarded value movement proved by Payment and ExecutionProof evidence.
- Receipt is an immutable, versioned human-readable snapshot of already committed PayRun and Ledger facts.

Domain Outbox remains separate delivery infrastructure. None of these records can substitute for another, and none may be updated or deleted to make history look cleaner.

## 6. Detailed semantics

### 6.1 Audit authority

Audit events are append-only records with identity and ordering scoped by:

```text
projectId + aggregateType + aggregateId + sequence
```

Each event records the aggregate before/after version, authenticated actor, action and reason code, idempotency and correlation IDs, server/database time, and redacted structured detail. The first event records aggregate creation; each subsequent event continues the exact aggregate version lineage. Audit cannot contain secrets, mutable snapshots as authority, synthetic Payment proof, or Ledger entries.

Local JSON enforces append-only behavior through repository methods, full-envelope runtime validation, uniqueness, and lineage checks. It exposes no update/delete repository operation. This protects application behavior in one local writer process but does not claim tamper resistance from a host administrator. Hosted/Postgres must additionally use insert/read-only runtime roles, database constraints, and no update/delete privilege for application roles.

### 6.2 Ledger authority

A `LedgerJournal` is immutable and owns at least two immutable `LedgerEntry` children. It binds:

- `id`, `projectId`, `payRunId`, environment, creation time, and canonical journal hash;
- `paymentExecutionId`, `executionProofId`, and their evidence hashes;
- the stable external reference when one exists, or the stable Sandbox evidence reference;
- one exact Asset reference and canonical integer atomic amount per journal; and
- optional `reversalOfJournalId` for a full correction reversal.

For every journal/asset:

- total debits equal total credits exactly;
- each entry has exactly one non-zero side;
- amounts are non-negative canonical integer atomic strings;
- all accounts and evidence belong to the same Project and environment; and
- the same verified proof or external reference cannot post twice.

The Slice 4 Sandbox journal uses two Project-scoped, environment-qualified simulated account roles: debit `sandbox_payment_expense` and credit `sandbox_controlled_funds`. Account IDs must remain in the Sandbox namespace. These entries describe the deterministic Sandbox scenario only; they do not claim bank, wallet, token, custody, bridge, or settlement balances.

### 6.3 Receipt authority

Receipt `v1` is created only from a committed terminal PayRun and its committed LedgerJournal. It persists at least:

- `projectId`, `payRunId`, terminal PayRun version, `receiptVersion`, and `receiptSchemaVersion`;
- environment and mandatory `SANDBOX / NO REAL FUNDS` watermark in Sandbox;
- immutable references/digests for PayIntent, PolicyDecision and Approval basis when present, FundingPreparation, PaymentExecution, ExecutionProof, and LedgerJournal;
- the lifecycle summary and evidence-safe human-readable fields;
- `createdAt`, optional `supersedesVersion`, and correction reason; and
- a canonical SHA-256 content hash over the Receipt payload excluding only the hash/signature fields themselves.

Canonical Receipt serialization recursively sorts object keys, preserves array order, retains money as canonical atomic strings, and rejects non-JSON/non-canonical values. `receiptVersion` starts at 1 and increments exactly once for each appended correction. `receiptSchemaVersion` changes only when the document schema changes and is independent of correction history.

Historical reads return the stored version and hash. They never recompose an older Receipt from the current PayRun, current labels, or a later schema.

### 6.4 Correction semantics

No correction mutates a terminal PayRun, AuditEvent, Journal, Entry, or Receipt.

- A non-financial Receipt presentation/metadata correction appends a new Receipt version with `supersedesVersion` pointing to the immediate prior version, an authenticated reason, AuditEvent, idempotency result, and Domain OutboxEvent. It cannot change Payment, Proof, or Ledger facts.
- A correction to financial facts requires a new controlled correction/compensation PayRun as required by the state machine. Its Ledger posts a full reversal linked by `reversalOfJournalId`, and when needed a separate replacement journal. A later Receipt version references the correction PayRun and resulting journal chain.
- A reversal exactly swaps every original debit and credit for the same Asset and atomic amount. Partial edits to an original journal are forbidden.
- A corrected Receipt never makes an earlier Receipt disappear or become unverifiable.

### 6.5 State machine and domain impact

This ADR adds no PayRun state or transition.

- `proof_collected → ledger_recording` prepares a balanced draft bound to Payment and Proof.
- `ledger_recording → completed` succeeds only with the immutable Journal/Entries committed in the same Unit of Work.
- Ledger failure leaves the PayRun in `ledger_recording` for idempotent retry; it never changes known Payment or Proof outcomes.
- Receipt creation occurs after completion as an independent idempotent projection and does not transition PayRun.

The future repository surface keeps distinct append-only Audit, Ledger, Receipt, and Domain Outbox repositories. PayRun may retain references and monotonic sequence/version metadata, but saving PayRun cannot replace those independent records.

## 7. Required invariants

1. Audit, Ledger, Receipt, ExecutionProof, Payment evidence, and Domain Outbox are distinct record classes and authorities.
2. Audit and Domain Outbox histories append in exact Project/aggregate sequence and cannot be updated or deleted through application repositories.
3. A LedgerJournal and its Entries are immutable and commit together.
4. Every journal balances exactly per Asset with canonical atomic amounts and at least two entries.
5. Each entry has exactly one non-zero debit/credit side and binds the committed journal.
6. Journal Project, PayRun, environment, Payment, Proof, evidence, and account namespaces match.
7. Verified proof/external reference uniqueness prevents duplicate posting within a Project.
8. `completed` requires the balanced Journal to commit atomically with terminal PayRun CAS, Audit, Outbox, idempotency, and ADR-0005 reservation consumption.
9. Ledger write failure leaves the PayRun at `ledger_recording`; it never converts verified Payment into failure.
10. Receipt versions are immutable, gap-free per Project/PayRun, hash-verifiable, and append corrections through the immediate `supersedesVersion`.
11. Receipt creation/correction cannot change the Payment, Proof, Ledger, or PayRun outcome.
12. Financial correction uses reversal/replacement journals and a new controlled PayRun; it never edits settled history.
13. Sandbox accounts/evidence cannot be read, exported, or labeled as live settlement evidence.
14. Any Project-scope, schema, hash, balance, uniqueness, CAS, Audit, or Outbox failure produces no partial Unit of Work.

## 8. Transaction / Unit of Work boundary

### Ledger completion

The terminal transaction is:

```text
validate expected PayRun and stage versions/states
→ validate canonical balanced Journal/Entries and evidence uniqueness
→ insert immutable Journal and Entries
→ consume the active BudgetReservation
→ CAS PayRun ledger_recording → completed
→ complete IdempotencyRecord
→ append AuditEvent
→ append Domain OutboxEvent
→ commit once
```

Every Project-scoped predicate must match exactly one expected record. No external call occurs inside this transaction.

### Receipt projection and correction

Receipt creation is a later independent Unit of Work after terminal commit:

```text
read committed PayRun/Ledger/evidence snapshot
→ derive and validate canonical Receipt payload/hash
→ append expected next Receipt version
→ complete projection/correction idempotency record
→ append AuditEvent and Domain OutboxEvent
→ commit once
```

It does not CAS or reopen the terminal PayRun. A Receipt failure rolls back only the Receipt projection Unit of Work and is retried from committed sources.

## 9. Failure and recovery behavior

- An unbalanced journal, mismatched environment/evidence, duplicate proof/reference, unsupported schema, or invalid atomic amount fails before commit and leaves PayRun in `ledger_recording`.
- Audit, Outbox, reservation-consumption, or PayRun CAS failure rolls back the whole Ledger completion transaction.
- A crash after a committed Ledger transaction is recovered by the idempotency record and uniqueness constraints; it does not post another journal.
- An identical journal replay resolves to the committed result when its canonical hash and evidence identities match. A mismatched replay is a conflict and requires investigation, not overwrite.
- Receipt generation failure does not undo completed PayRun/Ledger state. The projection retries with the same idempotency key and source versions.
- Receipt version conflict reloads the latest stored version. Identical content resolves idempotently; different content requires a new explicit correction command and expected latest version.
- A failed correction leaves all prior Receipt and Ledger versions intact and current.
- Corrupt or unsupported Local JSON fails explicitly; it is never reinitialized, repaired from temporary files, or replaced with seed data.

## 10. Idempotency / concurrency behavior

- Ledger commands use Project/command-scoped idempotency keys and canonical request hashes in addition to PayRun/stage CAS.
- Uniqueness applies to Project + journal ID, Project + ExecutionProof ID, and Project + stable external/Sandbox evidence reference.
- Concurrent Ledger completion attempts produce one immutable journal and one terminal PayRun transition.
- Audit sequence and Outbox sequence each advance exactly once for the winning transaction and never for a failed attempt.
- Receipt append requires the expected latest receipt version and `UNIQUE(projectId, payRunId, receiptVersion)`.
- Concurrent identical Receipt projections converge on one version. Competing different corrections cannot both claim the same next version.
- At-least-once worker execution is supported; exactly-once external effects are not claimed.

## 11. Audit / Outbox implications

Every canonical transition, Ledger post, Receipt creation, Receipt correction, reversal, and replacement produces an AuditEvent appropriate to its aggregate and a stable Domain OutboxEvent in the originating Unit of Work. Events include references and safe digests, not secrets or mutable authority snapshots.

Audit describes the action and actor; it does not carry debit/credit balances. Ledger records value movement; it does not substitute for human explanation. Domain Outbox enables later projection/delivery; an HTTP delivery result is not Audit, Ledger, Receipt, Payment, or Proof.

Slice 4 persists Domain Outbox events but does not implement HTTP webhook delivery. Slice 7 may project those events into webhook delivery without changing prior PayRun or Ledger results.

## 12. Sandbox behavior

Slice 4 produces balanced journals only in Project-scoped Sandbox account and evidence namespaces. Journal, Receipt-style validation projection, Audit, and Outbox data retain `environment=sandbox`, `realFundsMoved=false`, and explicit `SANDBOX / NO REAL FUNDS` meaning.

`sandbox_payment_expense` and `sandbox_controlled_funds` are simulated accounting roles. A balanced Sandbox journal proves only that the control loop recorded internally consistent simulation evidence after Sandbox Payment and verified task Proof. It does not prove a swap, bridge, bank movement, token movement, payment settlement, funds availability, or production accounting correctness.

Slice 4 does not create canonical Receipts. Its `ValidationReceiptProjection` remains a read-only research projection with `canonicalReceiptAvailable=false`; the Receipt contract here is reserved for Slice 7.

Local JSON provides one-store atomic replacement, same-process multi-instance coordination, and a single-writer cross-process lease for Local Development Sandbox Persistence. Append-only guarantees are application/storage-contract guarantees, not filesystem tamper resistance or production multi-process durability.

## 13. Live-money limitations

This ADR does not accept a live chart of accounts, settlement rail, finality model, custody model, accounting policy, tax treatment, reconciliation SLA, or signature scheme. A balanced Sandbox journal is not evidence of live double-entry settlement.

Hosted/Postgres must enforce immutable rows, Project-scoped foreign keys/uniqueness, transaction isolation, least-privilege insert/read roles, backup/recovery, and durable CAS under later hosted-persistence decisions. Any real rail requires ADR-0011 and the Live Money Gate, including rail-specific finality, reconciliation, compensation, incident response, and independent security/accounting review.

## 14. Test obligations

Future implementation tests must map every public behavior above:

- append-only Audit identity, monotonic sequence, exact before/after versions, actor/reason/correlation fields, redaction, and no update/delete contract;
- Audit gap, duplicate, cross-Project, wrong-version, and tampered-lineage rejection;
- balanced and unbalanced journal cases, one-sided entry rules, canonical atomic amount validation, and exact Asset totals;
- Project/PayRun/environment/Payment/Proof/account/evidence mismatch rejection;
- duplicate journal ID, ExecutionProof, and external/Sandbox evidence reference handling;
- concurrent and retried Ledger completion yields one journal, one consumed reservation, one terminal transition, one AuditEvent, and one OutboxEvent;
- fault injection at Journal, Entry, reservation, PayRun CAS, idempotency, Audit, Outbox, and commit boundaries leaves no partial write and keeps `ledger_recording`;
- exact Allowed and Funding mismatch fixtures finish with balanced isolated Sandbox journals; pending Review, reject, and Blocked have no journal;
- no Sandbox record or projection claims real settlement or real funds;
- Receipt version 1 derives only from committed PayRun/Ledger sources and historical read returns stored content;
- canonical Receipt serialization/hash stability, tamper detection, schema/version distinction, Sandbox watermark, and secret redaction;
- duplicate identical Receipt projection is idempotent; conflicting same-version content fails;
- non-financial correction appends the next version with immediate `supersedesVersion` and leaves prior bytes/hash intact;
- financial correction requires a new controlled PayRun, exact full reversal, optional replacement, and later Receipt version;
- Receipt projection/correction failure leaves completed PayRun/Ledger and all prior Receipt versions unchanged; and
- Local JSON restart/corruption tests preserve independent Audit, Ledger, Receipt, and Outbox collections without silent fallback.

## 15. Consequences

The design requires separate repositories and more explicit constraints, but preserves the evidentiary meaning of every record and makes failure recovery deterministic. Ledger completion stays on the critical path; Receipt generation does not. Corrections are more verbose because history is appended rather than edited, which is the required auditability tradeoff.

Migration is additive. Local Sandbox envelope/schema changes must be versioned and explicitly migrated or rejected; no existing record is overwritten. Hosted/Postgres uses expand/contract tables and constraints. Rollback may stop new projections or return to a compatible reader, but cannot remove Journals, AuditEvents, Receipts, or Outbox records. A binary that cannot read the newest immutable record schema is not a valid rollback target.

## 16. Deferred work

- Slice 7 canonical Receipt repository, projection worker, API/export, HMAC/webhook delivery, retry, and replay.
- Hosted/Postgres roles, constraints, migrations, PITR, restore drills, RPO/RTO, and operational retention.
- Receipt cryptographic signatures and managed signing-key custody.
- Production chart of accounts, accounting policy, reporting, tax, and jurisdictional requirements.
- Live rail finality, reconciliation, refund/chargeback semantics, and financial correction operations under ADR-0011.

## 17. Explicit non-goals

- Adding or renaming PayRun states.
- Implementing Slice 4 or Slice 7 in this proposal.
- Treating AuditEvent, Domain OutboxEvent, Payment evidence, ExecutionProof, LedgerJournal, or Receipt as interchangeable.
- Replacing the accepted aggregate/CAS model with event sourcing.
- Updating or deleting settled history.
- Building Local JSON into production, multi-process, network-filesystem, or tamper-proof storage.
- Claiming Sandbox proof, accounts, balance, or journal as real settlement.
- Enabling a live rail, wallet, signer, Funding, Payment, or production release.

## 18. Architecture source references

- [Architecture Baseline](../ARCHITECTURE.md): Sections 2, 5, 9, 11, 12, and 13.
- [Domain Model](../DOMAIN_MODEL.md): Sections 2, 3, 8, 10–13.
- [PayRun State Machine](../PAYRUN_STATE_MACHINE.md): Sections 4–6, 8–11.
- [Policy Engine](../POLICY_ENGINE.md): Sections 6, 10, and 12 for Ledger-plus-reservation budget authority.
- [Funding Layer](../FUNDING_LAYER.md): Sections 2, 7, 9, 11, and 13 for Sandbox evidence boundaries.
- [ADR-0002](./0002-payrun-lifecycle-only-execution-path.md): Proof-before-Ledger lifecycle and terminal authority.
- [ADR-0003](./0003-sandbox-first-execution.md): Sandbox isolation and forbidden settlement claims.
- [ADR-0004](./0004-project-scope-cas-and-outbox.md): Project scope, Unit of Work, Audit/Outbox atomicity, Ledger completion, and Receipt snapshots.
- [Pilot Scenarios](../../product/PILOT_SCENARIOS.md): exact Slice 4 Ledger expectations and Slice 7 Receipt exclusion.
- [Migration Roadmap](../../roadmap/ZENFIX_MIGRATION_ROADMAP.md): ADR prerequisite and Slice 4/Slice 7 boundaries.
