# Hosted Persistence Schema Contract

## Status and scope

This document records the Delivery 1 Unit 1 database contract for the future Interactive Hosted
Sandbox. It implements the accepted Project scope, CAS, Unit of Work, Audit, Outbox, reservation,
and balanced-ledger architecture at the schema boundary. It does not declare the Hosted Sandbox
ready and does not replace the outstanding persistence operations, recovery, or physical-isolation
gates.

This unit contains no authentication UI, application repository adapter, Agent or Policy product
tables, Control Loop behavior, deployment, or live-money capability.

## Identity and Personal Workspace

`projects` is the canonical tenant record. The product may display one personal Project as a
"Workspace", but there is no second Workspace aggregate. `projects.owner_user_id` references
`auth.users.id`, and a database unique constraint permits one personal Project per authenticated
user in this delivery.

The future server resolves the authenticated user first and obtains `projectId` from this ownership
mapping. A request-supplied project identifier is never authentication authority.

## Request role and RLS

The migration creates `zenfix_app` as a `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOINHERIT`
transaction role. It is not the migration owner. A separately provisioned server-only login role
will be granted membership in `zenfix_app`, remain non-superuser/non-BYPASSRLS, and run direct SQL
transactions with `SET LOCAL ROLE zenfix_app` after binding the verified Auth user context.

No password or login credential is stored in the migration. Environment provisioning must verify
the login role independently before Hosted acceptance.

All tenant tables require `project_id`, enable and force RLS, and expose owner-scoped policies only
to `zenfix_app`. `anon`, `authenticated`, and `service_role` receive no table privileges from this
schema. The application request path must not use the Supabase service-role identity.

The role may call `auth.uid()` but cannot read `auth.users`. Anonymous identity produces no visible
tenant rows and cannot insert them. Cross-owner reads return no rows; cross-owner writes and forged
`project_id` inserts are rejected.

## Repository and transaction mapping

The relational tables map to the existing application ports:

| Existing contract | Hosted table |
| --- | --- |
| Personal Project ownership | `projects` |
| `PayRunRepository` | `pay_runs` |
| `ApprovalRepository` | `approvals` |
| `BudgetReservationRepository` | `budget_reservations` |
| `FundingPreparationRepository` | `funding_preparations` |
| `PaymentExecutionRepository` | `payment_executions` |
| `LedgerRepository` | `ledger_journals`, `ledger_entries` |
| `AuditEventRepository` | `audit_events` |
| `DomainOutboxRepository` | `domain_outbox_events` |
| `IdempotencyRepository` | `idempotency_records` |
| `InboxEventRepository` | `inbox_events` |

Mutable aggregates carry positive monotonic versions. A future adapter implements CAS with one
statement scoped by `project_id`, aggregate ID, expected version, and expected state; an affected-row
count other than one is a version conflict. This migration does not add a database function that
could bypass the repository contract.

The schema permits a future direct-SQL Unit of Work to commit aggregate CAS, stage data,
Idempotency, Audit, and Domain Outbox rows in one Postgres transaction. Audit, Outbox, Journals, and
Ledger entries are append-only for the request role. Ledger balance is checked by a deferred
constraint trigger at transaction commit, so a partial or imbalanced Journal cannot commit.

Canonical aggregate JSON remains in `document`; extracted identity, project, version, and state
columns are checked against it. Full runtime domain-schema validation remains the responsibility of
the future Postgres repository adapter and is not replaced by JSONB storage.

## Migration path

The forward migration is:

`supabase/migrations/202607150001_hosted_project_and_payrun_storage.sql`

It is additive and intended for a dedicated, empty Hosted Sandbox Supabase project. It creates the
transaction role, tenant tables, project-scoped keys, RLS policies, grants, immutable-row triggers,
and the deferred ledger-balance constraint. It does not seed a Project, PayRun, fixture, or Pilot
Session and does not migrate Local JSON data.

Before any remote application, the same migration must pass against an ephemeral Supabase/Postgres
environment in CI. Applying it to a shared or production database is outside this unit.

## Rollback and irreversible records

There is intentionally no destructive down migration. Once financial, Audit, Ledger, or Outbox rows
exist, rollback must not drop or rewrite them.

Before the schema receives hosted traffic, rollback is to discard the ephemeral database or remove
the not-yet-used schema under an explicitly reviewed operator procedure. After traffic begins,
rollback means:

1. stop new hosted intake;
2. deploy the preceding compatible application artifact;
3. retain all schema and rows;
4. use a new forward migration to correct schema defects.

An application rollback target that cannot read the newest immutable record format is invalid.
Database unavailability must return `503`; it must never switch to Local JSON or a bundled fixture.
PITR, RPO/RTO, restore drills, and expand/contract operational acceptance remain prerequisites for a
Hosted-readiness claim.

## Verification boundary

`npm run test:rls` executes the migration against PGlite, a real Postgres engine compiled to WASM,
and proves database roles, RLS behavior, constraints, and denial paths without external credentials.
This is deterministic local contract evidence, not a substitute for running the same migration and
tests against the selected Supabase Postgres version before deployment.
