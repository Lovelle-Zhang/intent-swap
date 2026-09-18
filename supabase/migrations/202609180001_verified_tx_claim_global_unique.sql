-- Tighten on-chain replay protection from project-scoped to GLOBAL.
--
-- The original verified_tx_claims PRIMARY KEY (project_id, rail, transaction_hash)
-- bound a verified transfer to one Pay Run WITHIN a project — but the same real
-- transaction could still be claimed once in every workspace, letting one public
-- USDC transfer back a "Verified on-chain" Pay Run in each tenant. Add a GLOBAL
-- UNIQUE (rail, transaction_hash) so a verified transaction backs exactly one Pay
-- Run across ALL tenants; a second claim from any project fails with 23505 →
-- DuplicateRecordError → 409, rolling the whole report transaction back.
--
-- Additive: the original composite PK is left in place; this only narrows what's
-- allowed. The unique constraint is enforced by the engine independent of RLS row
-- visibility, so a cross-tenant duplicate is rejected even though the other
-- project's claim row is RLS-invisible to the caller.
--
-- (Verified claims are written only for runs with a pinned merchant payout address
-- — the trust anchor required for the verified badge — so this constrains exactly
-- the transfers that earn a proof-backed receipt.)
BEGIN;

ALTER TABLE public.verified_tx_claims
  ADD CONSTRAINT verified_tx_claims_rail_hash_unique UNIQUE (rail, transaction_hash);

COMMIT;
