-- Workspace daily budget (budget-ledger).
--
-- A workspace may cap how much it authorizes per UTC day. The cap is a single
-- atomic-USDC amount stored alongside the workspace policy; '0' means unlimited.
-- "Spent today" is DERIVED from pay_runs at intake (no ledger table), so this is
-- the only new persisted state. Additive migration; depends on 202609070002 for
-- the public.policies table.

BEGIN;

ALTER TABLE public.policies ADD COLUMN daily_budget_atomic text NOT NULL DEFAULT '0';

COMMIT;
