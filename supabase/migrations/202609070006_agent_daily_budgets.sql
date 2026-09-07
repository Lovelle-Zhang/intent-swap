-- Per-agent daily budgets (budget-ledger).
--
-- Each agentId in a workspace may carry its own DAILY (UTC) spend cap on top of
-- the workspace-wide daily budget. Caps are stored as a JSON map agentId ->
-- atomic-USDC string alongside the workspace policy; an empty map means no
-- per-agent caps. "Spent today by that agent" is DERIVED from pay_runs at intake
-- (no ledger table), so this map is the only new persisted state. Additive
-- migration; depends on 202609070002 for the public.policies table.

BEGIN;

ALTER TABLE public.policies ADD COLUMN agent_budgets jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
