-- Execution-report terminal status (execution-report webhook).
--
-- ZenFix is an authorization + audit layer that never executes payments. After
-- an agent executes an allowed payment on its own rail, it reports the outcome
-- and proof back to ZenFix, which records it and moves the Pay Run to a new
-- terminal status `execution_reported`, closing the audit loop.
--
-- The pay_runs.status column carries an inline CHECK enumerating the canonical
-- states. Widen it to admit `execution_reported`. Additive migration; depends on
-- 202607150001 for the pay_runs table and its original constraint.

BEGIN;

ALTER TABLE public.pay_runs DROP CONSTRAINT pay_runs_status_check;

ALTER TABLE public.pay_runs ADD CONSTRAINT pay_runs_status_check CHECK (status IN (
  'intent_recorded', 'policy_evaluating', 'policy_allowed', 'execution_reported',
  'pending_review', 'approved', 'funding_preparing', 'funding_prepared',
  'payment_executing', 'payment_unknown', 'payment_succeeded', 'proof_collecting',
  'proof_collected', 'ledger_recording', 'completed', 'blocked', 'denied',
  'expired', 'cancellation_pending', 'cancelled', 'failed'
));

COMMIT;
