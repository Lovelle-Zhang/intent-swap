# ADR-0004: Project Scope, CAS, Unit of Work, and Webhook Outbox

**Status:** Accepted
**Date:** 2026-07-12
**Owner:** ZenFix Architecture and Data

## Context

The reference implementation uses global reads, aggregate JSON replacement, plaintext API keys, sync/async duplication, non-transactional Approval, and webhook dispatch after business writes. Those patterns cannot provide tenant isolation, concurrency safety, or reliable audit delivery.

## Decision

- Every business repository method requires authenticated Project context. A narrow pre-authentication `AuthKeyRepository` may locate a credential digest by public key ID/prefix only; after verification it returns the bound Project/scopes and cannot read tenant business data.
- Tenant-owned relational data uses `project_id NOT NULL`, project-scoped uniqueness, and project-scoped foreign keys.
- Every mutable aggregate carries a monotonic version.
- Mutations compare-and-set every affected aggregate on project, ID, expected version, and expected state; every predicate must update exactly one row or the transaction rolls back with `409 version_conflict`.
- Side-effecting commands require canonical request hashes and `UNIQUE(project_id, command_type, idempotency_key)`. Records expose `in_progress/completed/unknown` and execution keys are retained for the full reconciliation/financial record period.
- Each transition commits `PayRun CAS + affected stage aggregate/artifact + idempotency result + AuditEvent + OutboxEvent` in one Unit of Work. Callback transitions additionally consume the project-scoped InboxEvent; Ledger completion atomically persists the balanced Journal/Entries and terminal PayRun transition.
- Webhook HTTP delivery runs asynchronously from an immutable, schema-versioned outbox with `UNIQUE(project_id,event_id)`, stable payload, lease/CAS claim, append-only attempts, backoff/jitter, DLQ, and at-least-once semantics.
- Configured storage failure returns an explicit error; no local/demo fallback is allowed.

The Project-scoped Storage/Control Loop introduces a Domain OutboxEvent for every canonical transition even before external webhook delivery exists. Slice 7 adds endpoint subscription, projection, HTTP delivery, retry, and replay; it does not make transition-event persistence optional.

## Security invariants

- Project identity comes from authentication and cannot be overridden by request fields.
- Cross-project access returns not found and reveals no resource metadata.
- API key plaintext is displayed once; storage keeps ID/prefix, binding metadata, and a pepper-versioned HMAC-SHA-256 digest or separately approved equivalent, with constant-time verification. The request-path database role cannot `BYPASSRLS`.
- Webhook secrets are encrypted under managed key custody and redacted after creation.
- RLS and least-privilege roles provide defense in depth; service-role bypass is not the application tenancy model.

## Concurrency and delivery behavior

- CAS conflict returns a stable version-conflict result and creates no side effect.
- Same idempotency key plus same request hash returns the original result.
- Same key plus different hash returns conflict.
- A first request that is still `in_progress` or `unknown` returns that durable status and is reconciled; it does not start a second operation.
- External outcome ambiguity is reconciled using stable provider reference before retry.
- Outbox retries retain event identity and payload; delivery attempts are separate append-only records.
- Endpoint activation requires real challenge-response ownership verification; recorded events, arbitrary `2xx`, and skip-verification paths cannot activate it.

## Rejected alternatives

- Last-write-wins and unconditional upsert were rejected because concurrent Approval/execution can duplicate payment.
- Storing audit only inside a mutable PayRun JSON document was rejected because history can be overwritten.
- Synchronous webhook delivery in the business request was rejected because it creates partial failure and lost-event windows.
- Silent Supabase-to-local fallback was rejected because it mixes tenants, hides outages, and cannot represent an empty dataset.

## Failure behavior

Database unavailability blocks state transition and external execution. Webhook delivery failure does not roll back committed business state; it enters retry/DLQ. Audit/outbox write failure rolls back the whole state transaction.

Audit events are stored independently with `UNIQUE(project_id,aggregate_type,aggregate_id,sequence)`, before/after versions, actor, stable action/reason code, idempotency/correlation IDs, and database time. Runtime roles may insert/read but not update/delete Audit rows, and secret fields are redacted.

## Rollback and migration

Persistence changes use expand/contract and preserve compatibility with the previous application version. Financial history, AuditEvents, Ledger, Receipts, and outbox records are never removed by a down migration. External settled effects require compensation, not status rollback.

Receipt snapshots use separate document and schema versions, canonical content hashes, Sandbox watermarking, and `UNIQUE(project_id,pay_run_id,receipt_version)`. Corrections append a superseding version; historical reads never rebuild an old Receipt from mutable current state.

## Verification

- cross-project negative tests for every API and worker query
- concurrent CAS and Approval tests
- duplicate/mismatched idempotency tests
- transaction fault injection for audit/outbox atomicity
- worker lease, retry, duplicate delivery, and crash recovery tests
- storage outage proves fail-closed behavior
