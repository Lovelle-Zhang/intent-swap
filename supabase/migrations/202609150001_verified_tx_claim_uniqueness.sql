-- Replay protection for on-chain verification. On a verified rail (Base) an
-- `executed` outcome is only recorded after we match the claim to a real USDC
-- transfer (right token, amount >= authorized, receipt success). But a transfer
-- is fungible against that check: the SAME transaction hash could be reported to
-- satisfy several different Pay Runs whose authorized amount is <= the transfer.
--
-- This table binds each verified transaction to exactly one Pay Run within a
-- project. The report unit of work inserts one row here; the primary key makes a
-- second Pay Run's attempt to claim the same (rail, transactionHash) fail (23505),
-- which rolls the whole report transaction back and returns a conflict. Insert-only
-- and project-scoped, mirroring the other hosted tables' RLS and grants.
BEGIN;

CREATE TABLE public.verified_tx_claims (
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE RESTRICT,
  rail text NOT NULL CHECK (length(rail) > 0),
  transaction_hash text NOT NULL CHECK (length(transaction_hash) > 0),
  pay_run_id text NOT NULL CHECK (length(pay_run_id) > 0),
  claimed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, rail, transaction_hash)
);

-- Insert-only: a verified transaction's binding to a Pay Run is never rewritten.
CREATE TRIGGER verified_tx_claims_append_only
  BEFORE UPDATE OR DELETE ON public.verified_tx_claims
  FOR EACH ROW EXECUTE FUNCTION public.zenfix_reject_immutable_mutation();

ALTER TABLE public.verified_tx_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_tx_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY verified_tx_claims_owner_select ON public.verified_tx_claims
  FOR SELECT TO zenfix_app
  USING (public.zenfix_owns_project(project_id));
CREATE POLICY verified_tx_claims_owner_insert ON public.verified_tx_claims
  FOR INSERT TO zenfix_app
  WITH CHECK (public.zenfix_owns_project(project_id));

REVOKE ALL ON TABLE public.verified_tx_claims FROM PUBLIC;
DO $revoke_supabase_roles$
DECLARE
  runtime_role text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.verified_tx_claims FROM %I', runtime_role);
    END IF;
  END LOOP;
END
$revoke_supabase_roles$;

GRANT SELECT, INSERT ON TABLE public.verified_tx_claims TO zenfix_app;

COMMIT;
