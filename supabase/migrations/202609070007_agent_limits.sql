-- Per-agent fine-grained controls: an optional per-transaction cap and an
-- optional merchant allowlist, keyed by agentId. Stored alongside the workspace
-- policy. These only ever TIGHTEN the workspace policy for a given agent (the
-- effective per-transaction limit is the min, the effective allowed merchants
-- are the intersection); they can never loosen it. Shape:
--   { "<agentId>": { "perTxAtomic": "<atomic USDC>", "merchants": ["m1","m2"] } }
-- An absent key, an absent field, or "0"/[] means "no per-agent override".
ALTER TABLE public.policies
  ADD COLUMN agent_limits jsonb NOT NULL DEFAULT '{}'::jsonb;
