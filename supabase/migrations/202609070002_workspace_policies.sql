-- Workspace policy storage (2B-policy).
--
-- One editable policy per personal workspace: the budget caps, merchant
-- allow/block lists and review thresholds the real policy engine already
-- consumes (PolicyRuleSnapshot). Unlike the pay-run aggregates this is a plain
-- settings row (single row per project, last-write-wins with a monotonically
-- advancing version for display), so it does NOT join the CAS aggregate-update
-- trigger — it only needs the same owner-scoped RLS and role grants.
--
-- Additive migration. Depends on 202607150001 for the zenfix_app role and the
-- public.zenfix_owns_project(uuid) helper.

BEGIN;

CREATE TABLE public.policies (
  project_id uuid PRIMARY KEY REFERENCES public.projects (id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  rules jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies FORCE ROW LEVEL SECURITY;
CREATE POLICY policies_owner_select ON public.policies
  FOR SELECT TO zenfix_app
  USING (public.zenfix_owns_project(project_id));
CREATE POLICY policies_owner_insert ON public.policies
  FOR INSERT TO zenfix_app
  WITH CHECK (public.zenfix_owns_project(project_id));
CREATE POLICY policies_owner_update ON public.policies
  FOR UPDATE TO zenfix_app
  USING (public.zenfix_owns_project(project_id))
  WITH CHECK (public.zenfix_owns_project(project_id));

REVOKE ALL ON TABLE public.policies FROM PUBLIC;

DO $revoke_supabase_roles$
DECLARE
  runtime_role text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.policies FROM %I', runtime_role);
    END IF;
  END LOOP;
END
$revoke_supabase_roles$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.policies TO zenfix_app;

COMMIT;
