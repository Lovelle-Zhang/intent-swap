# ZenFix Architecture Decision Records

Architecture decisions in this directory are immutable records. Superseded decisions remain in place and link to the ADR that replaces them.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](./0001-incremental-strangler-migration.md) | Evolve `intent-swap` through incremental strangler migration | Accepted |
| [0002](./0002-payrun-lifecycle-only-execution-path.md) | Make the PayRun lifecycle the only payment execution path | Accepted |
| [0003](./0003-sandbox-first-execution.md) | Keep funding and payment execution sandbox-first | Accepted |
| [0004](./0004-project-scope-cas-and-outbox.md) | Require project scope, CAS, unit of work, and webhook outbox | Accepted |
| [0005](./0005-budget-reservation-approval-binding-and-separation-of-duties.md) | Use transactional budget reservation, immutable Approval binding, and separation of duties | ACCEPTED |
| [0006](./0006-append-only-audit-balanced-ledger-and-receipt-corrections.md) | Keep Audit, balanced Ledger, and versioned Receipt corrections independent and append-only | ACCEPTED |

## Required decision register

These decisions receive their own ADR before the named capability is implemented or enabled:

| Planned ADR | Required before |
| --- | --- |
| [0005](./0005-budget-reservation-approval-binding-and-separation-of-duties.md) — budget reservation, Approval binding, and separation of duties | Before Slice 4 Review/Funding implementation and Slice 5 execution Gate |
| [0006](./0006-append-only-audit-balanced-ledger-and-receipt-corrections.md) — append-only audit, balanced Ledger, and Receipt corrections | Before Slice 4 Ledger implementation; Receipt details finalized before Slice 7 Gate |
| 0007 — webhook SSRF controls, secret rotation, retry/DLQ, and replay | HTTP webhook delivery |
| 0008 — API-key hashing and future signer/rail credential custody | `/api/v1` and any guarded signer |
| 0009 — multi-level kill switch and incident authority | Hosted Sandbox and live-money review |
| 0010 — database expand/contract, PITR, RPO/RTO, and restore drills | Hosted persistence |
| 0011 — live rail, double-entry settlement, finality, and reconciliation | Any real-money canary |

## ADR lifecycle

1. New decisions start as `Proposed`.
2. Accepted decisions record consequences and rollback implications.
3. Reversal requires a new ADR; accepted files are not rewritten to hide history.
4. Every implementation slice cites the ADRs it relies on in its PR description.
