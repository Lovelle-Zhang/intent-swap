BEGIN;

-- The migration owner remains separate from the request-path role. The login
-- role used by the hosted server is provisioned per environment and assumes
-- zenfix_app inside each direct-SQL transaction.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zenfix_app') THEN
    CREATE ROLE zenfix_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$role$;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  workspace_kind text NOT NULL DEFAULT 'personal' CHECK (workspace_kind = 'personal'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode = 'sandbox'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT projects_one_personal_workspace_per_user UNIQUE (owner_user_id),
  CONSTRAINT projects_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.pay_runs (
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) > 0),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN (
    'intent_recorded', 'policy_evaluating', 'policy_allowed', 'pending_review',
    'approved', 'funding_preparing', 'funding_prepared', 'payment_executing',
    'payment_unknown', 'payment_succeeded', 'proof_collecting', 'proof_collected',
    'ledger_recording', 'completed', 'blocked', 'denied', 'expired',
    'cancellation_pending', 'cancelled', 'failed'
  )),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  CONSTRAINT pay_runs_document_identity CHECK (
    document ->> 'projectId' = project_id::text
    AND document ->> 'id' = id
    AND document ->> 'version' = version::text
    AND document ->> 'status' = status
  ),
  CONSTRAINT pay_runs_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.approvals (
  project_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) > 0),
  pay_run_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, pay_run_id)
    REFERENCES public.pay_runs (project_id, id) ON DELETE RESTRICT,
  CONSTRAINT approvals_document_identity CHECK (
    document ->> 'projectId' = project_id::text
    AND document ->> 'id' = id
    AND document ->> 'version' = version::text
    AND document ->> 'status' = status
  ),
  CONSTRAINT approvals_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.budget_reservations (
  project_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) > 0),
  pay_run_id text NOT NULL,
  scope_generation integer NOT NULL CHECK (scope_generation > 0),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('active', 'released', 'consumed')),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, pay_run_id)
    REFERENCES public.pay_runs (project_id, id) ON DELETE RESTRICT,
  CONSTRAINT budget_reservations_scope_generation_unique
    UNIQUE (project_id, pay_run_id, scope_generation),
  CONSTRAINT budget_reservations_document_identity CHECK (
    document ->> 'projectId' = project_id::text
    AND document ->> 'id' = id
    AND document ->> 'version' = version::text
    AND document ->> 'status' = status
  ),
  CONSTRAINT budget_reservations_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.funding_preparations (
  project_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) > 0),
  pay_run_id text NOT NULL,
  budget_reservation_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN (
    'requested', 'not_required', 'planned', 'sandbox_prepared', 'prepared',
    'unsupported', 'failed', 'expired'
  )),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, pay_run_id)
    REFERENCES public.pay_runs (project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, budget_reservation_id)
    REFERENCES public.budget_reservations (project_id, id) ON DELETE RESTRICT,
  CONSTRAINT funding_preparations_one_per_reservation
    UNIQUE (project_id, budget_reservation_id),
  CONSTRAINT funding_preparations_document_identity CHECK (
    document ->> 'projectId' = project_id::text
    AND document ->> 'id' = id
    AND document ->> 'version' = version::text
    AND document ->> 'status' = status
  ),
  CONSTRAINT funding_preparations_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.payment_executions (
  project_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) > 0),
  pay_run_id text NOT NULL,
  funding_preparation_id text NOT NULL,
  execution_key text NOT NULL CHECK (length(execution_key) > 0),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN (
    'prepared', 'submitted', 'succeeded', 'unknown', 'failed_no_transfer'
  )),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, pay_run_id)
    REFERENCES public.pay_runs (project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, funding_preparation_id)
    REFERENCES public.funding_preparations (project_id, id) ON DELETE RESTRICT,
  CONSTRAINT payment_executions_execution_key_unique UNIQUE (project_id, execution_key),
  CONSTRAINT payment_executions_document_identity CHECK (
    document ->> 'projectId' = project_id::text
    AND document ->> 'id' = id
    AND document ->> 'version' = version::text
    AND document ->> 'status' = status
  ),
  CONSTRAINT payment_executions_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.ledger_journals (
  project_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) > 0),
  pay_run_id text NOT NULL,
  payment_execution_id text NOT NULL,
  execution_proof_id text NOT NULL CHECK (length(execution_proof_id) > 0),
  external_reference text NOT NULL CHECK (length(external_reference) > 0),
  version integer NOT NULL CHECK (version > 0),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  committed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, pay_run_id)
    REFERENCES public.pay_runs (project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, payment_execution_id)
    REFERENCES public.payment_executions (project_id, id) ON DELETE RESTRICT,
  CONSTRAINT ledger_journals_proof_unique UNIQUE (project_id, execution_proof_id),
  CONSTRAINT ledger_journals_external_reference_unique UNIQUE (project_id, external_reference),
  CONSTRAINT ledger_journals_document_identity CHECK (
    document ->> 'projectId' = project_id::text
    AND document ->> 'id' = id
    AND document ->> 'version' = version::text
  ),
  CONSTRAINT ledger_journals_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TABLE public.ledger_entries (
  project_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) > 0),
  journal_id text NOT NULL,
  account_id text NOT NULL CHECK (length(account_id) > 0),
  account_role text NOT NULL CHECK (length(account_role) > 0),
  debit_atomic numeric(78, 0) NOT NULL CHECK (debit_atomic >= 0),
  credit_atomic numeric(78, 0) NOT NULL CHECK (credit_atomic >= 0),
  evidence_hash text NOT NULL CHECK (length(evidence_hash) > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, journal_id)
    REFERENCES public.ledger_journals (project_id, id) ON DELETE RESTRICT,
  CONSTRAINT ledger_entries_one_sided_amount CHECK (
    (debit_atomic > 0 AND credit_atomic = 0)
    OR (credit_atomic > 0 AND debit_atomic = 0)
  )
);

CREATE TABLE public.audit_events (
  project_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) > 0),
  pay_run_id text NOT NULL,
  aggregate_type text NOT NULL CHECK (aggregate_type = 'PayRun'),
  aggregate_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  before_version integer NOT NULL CHECK (before_version >= 0),
  after_version integer NOT NULL,
  actor_id text NOT NULL CHECK (length(actor_id) > 0),
  actor_type text NOT NULL CHECK (actor_type IN ('agent', 'user', 'system', 'worker')),
  action_code text NOT NULL CHECK (length(action_code) > 0),
  reason_code text NOT NULL CHECK (length(reason_code) > 0),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) > 0),
  correlation_id text NOT NULL CHECK (length(correlation_id) > 0),
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, pay_run_id)
    REFERENCES public.pay_runs (project_id, id) ON DELETE RESTRICT,
  CONSTRAINT audit_events_aggregate_identity CHECK (aggregate_id = pay_run_id),
  CONSTRAINT audit_events_contiguous_versions CHECK (after_version = before_version + 1),
  CONSTRAINT audit_events_lineage_unique
    UNIQUE (project_id, aggregate_type, aggregate_id, sequence)
);

CREATE TABLE public.domain_outbox_events (
  project_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) > 0),
  aggregate_type text NOT NULL CHECK (aggregate_type = 'PayRun'),
  aggregate_id text NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  sequence integer NOT NULL CHECK (sequence > 0),
  event_type text NOT NULL CHECK (event_type IN ('payrun.created', 'payrun.transitioned')),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, aggregate_id)
    REFERENCES public.pay_runs (project_id, id) ON DELETE RESTRICT,
  CONSTRAINT domain_outbox_lineage_unique
    UNIQUE (project_id, aggregate_type, aggregate_id, sequence)
);

CREATE TABLE public.idempotency_records (
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) > 0),
  version integer NOT NULL CHECK (version > 0),
  state text NOT NULL CHECK (state IN ('in_progress', 'completed', 'unknown')),
  command_type text NOT NULL CHECK (length(command_type) > 0),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) > 0),
  request_hash text NOT NULL CHECK (length(request_hash) > 0),
  result_resource_id text,
  result_version integer CHECK (result_version IS NULL OR result_version > 0),
  response_status integer CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  retention_until timestamptz NOT NULL,
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  CONSTRAINT idempotency_scope_unique UNIQUE (project_id, command_type, idempotency_key),
  CONSTRAINT idempotency_document_identity CHECK (
    document ->> 'projectId' = project_id::text
    AND document ->> 'id' = id
    AND document ->> 'version' = version::text
    AND document ->> 'state' = state
  ),
  CONSTRAINT idempotency_timestamp_order CHECK (updated_at >= created_at),
  CONSTRAINT idempotency_retention_after_creation CHECK (retention_until > created_at)
);

CREATE TABLE public.inbox_events (
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE RESTRICT,
  id text NOT NULL CHECK (length(id) > 0),
  source text NOT NULL CHECK (length(source) > 0),
  source_event_id text NOT NULL CHECK (length(source_event_id) > 0),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('received', 'consumed')),
  payload_digest text NOT NULL CHECK (length(payload_digest) > 0),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (project_id, id),
  CONSTRAINT inbox_source_event_unique UNIQUE (project_id, source, source_event_id),
  CONSTRAINT inbox_document_identity CHECK (
    document ->> 'projectId' = project_id::text
    AND document ->> 'id' = id
    AND document ->> 'version' = version::text
    AND document ->> 'status' = status
  ),
  CONSTRAINT inbox_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX pay_runs_project_status_updated_idx
  ON public.pay_runs (project_id, status, updated_at DESC, id);
CREATE INDEX budget_reservations_active_idx
  ON public.budget_reservations (project_id, status, updated_at DESC)
  WHERE status = 'active';
CREATE INDEX audit_events_pay_run_sequence_idx
  ON public.audit_events (project_id, pay_run_id, sequence);
CREATE INDEX domain_outbox_unprojected_idx
  ON public.domain_outbox_events (project_id, occurred_at, id);

CREATE FUNCTION public.zenfix_reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.zenfix_reject_immutable_mutation();
CREATE TRIGGER domain_outbox_events_append_only
  BEFORE UPDATE OR DELETE ON public.domain_outbox_events
  FOR EACH ROW EXECUTE FUNCTION public.zenfix_reject_immutable_mutation();
CREATE TRIGGER ledger_journals_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_journals
  FOR EACH ROW EXECUTE FUNCTION public.zenfix_reject_immutable_mutation();
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.zenfix_reject_immutable_mutation();

CREATE FUNCTION public.zenfix_enforce_aggregate_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (to_jsonb(NEW) ->> 'id') IS DISTINCT FROM (to_jsonb(OLD) ->> 'id')
    OR (to_jsonb(NEW) ->> 'project_id') IS DISTINCT FROM (to_jsonb(OLD) ->> 'project_id')
    OR (to_jsonb(NEW) ->> 'owner_user_id') IS DISTINCT FROM (to_jsonb(OLD) ->> 'owner_user_id')
    OR (to_jsonb(NEW) ->> 'created_at') IS DISTINCT FROM (to_jsonb(OLD) ->> 'created_at')
  THEN
    RAISE EXCEPTION '% aggregate identity is immutable', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  IF (NEW.version) <> (OLD.version + 1) THEN
    RAISE EXCEPTION '% version must advance exactly once', TG_TABLE_NAME
      USING ERRCODE = '40001';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION '% updated_at cannot move backwards', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

DO $aggregate_update_triggers$
DECLARE
  aggregate_table text;
BEGIN
  FOREACH aggregate_table IN ARRAY ARRAY[
    'projects',
    'pay_runs',
    'approvals',
    'budget_reservations',
    'funding_preparations',
    'payment_executions',
    'idempotency_records',
    'inbox_events'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.zenfix_enforce_aggregate_update()',
      aggregate_table || '_cas_shape', aggregate_table
    );
  END LOOP;
END
$aggregate_update_triggers$;

CREATE FUNCTION public.zenfix_assert_balanced_ledger_journal()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  target_project_id uuid;
  target_journal_id text;
  entry_count bigint;
  debit_total numeric(78, 0);
  credit_total numeric(78, 0);
BEGIN
  target_project_id := COALESCE(
    (to_jsonb(NEW) ->> 'project_id')::uuid,
    (to_jsonb(OLD) ->> 'project_id')::uuid
  );
  target_journal_id := CASE
    WHEN TG_TABLE_NAME = 'ledger_journals' THEN
      COALESCE(to_jsonb(NEW) ->> 'id', to_jsonb(OLD) ->> 'id')
    ELSE
      COALESCE(to_jsonb(NEW) ->> 'journal_id', to_jsonb(OLD) ->> 'journal_id')
  END;

  SELECT count(*), COALESCE(sum(debit_atomic), 0), COALESCE(sum(credit_atomic), 0)
  INTO entry_count, debit_total, credit_total
  FROM public.ledger_entries
  WHERE project_id = target_project_id AND journal_id = target_journal_id;

  IF entry_count < 2 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'ledger journal % is not balanced', target_journal_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER ledger_journals_balanced_on_commit
  AFTER INSERT ON public.ledger_journals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.zenfix_assert_balanced_ledger_journal();
CREATE CONSTRAINT TRIGGER ledger_entries_balanced_on_commit
  AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.zenfix_assert_balanced_ledger_journal();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
CREATE POLICY projects_owner_select ON public.projects
  FOR SELECT TO zenfix_app
  USING (owner_user_id = auth.uid());
CREATE POLICY projects_owner_insert ON public.projects
  FOR INSERT TO zenfix_app
  WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY projects_owner_update ON public.projects
  FOR UPDATE TO zenfix_app
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE FUNCTION public.zenfix_owns_project(target_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = target_project_id AND owner_user_id = auth.uid()
  )
$function$;

DO $rls$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'pay_runs',
    'approvals',
    'budget_reservations',
    'funding_preparations',
    'payment_executions',
    'ledger_journals',
    'ledger_entries',
    'audit_events',
    'domain_outbox_events',
    'idempotency_records',
    'inbox_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO zenfix_app USING (public.zenfix_owns_project(project_id))',
      tenant_table || '_owner_select', tenant_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO zenfix_app WITH CHECK (public.zenfix_owns_project(project_id))',
      tenant_table || '_owner_insert', tenant_table
    );
  END LOOP;

  FOREACH tenant_table IN ARRAY ARRAY[
    'pay_runs',
    'approvals',
    'budget_reservations',
    'funding_preparations',
    'payment_executions',
    'idempotency_records',
    'inbox_events'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO zenfix_app USING (public.zenfix_owns_project(project_id)) WITH CHECK (public.zenfix_owns_project(project_id))',
      tenant_table || '_owner_update', tenant_table
    );
  END LOOP;
END
$rls$;

REVOKE ALL ON TABLE
  public.projects,
  public.pay_runs,
  public.approvals,
  public.budget_reservations,
  public.funding_preparations,
  public.payment_executions,
  public.ledger_journals,
  public.ledger_entries,
  public.audit_events,
  public.domain_outbox_events,
  public.idempotency_records,
  public.inbox_events
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zenfix_reject_immutable_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zenfix_enforce_aggregate_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zenfix_assert_balanced_ledger_journal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zenfix_owns_project(uuid) FROM PUBLIC;

DO $revoke_supabase_roles$
DECLARE
  runtime_role text;
  tenant_table text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      FOREACH tenant_table IN ARRAY ARRAY[
        'projects', 'pay_runs', 'approvals', 'budget_reservations',
        'funding_preparations', 'payment_executions', 'ledger_journals',
        'ledger_entries', 'audit_events', 'domain_outbox_events',
        'idempotency_records', 'inbox_events'
      ]
      LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tenant_table, runtime_role);
      END LOOP;
    END IF;
  END LOOP;
END
$revoke_supabase_roles$;

GRANT USAGE ON SCHEMA public TO zenfix_app;
GRANT USAGE ON SCHEMA auth TO zenfix_app;
GRANT EXECUTE ON FUNCTION auth.uid() TO zenfix_app;
GRANT EXECUTE ON FUNCTION public.zenfix_owns_project(uuid) TO zenfix_app;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.projects,
  public.pay_runs,
  public.approvals,
  public.budget_reservations,
  public.funding_preparations,
  public.payment_executions,
  public.idempotency_records,
  public.inbox_events
TO zenfix_app;

GRANT SELECT, INSERT ON TABLE
  public.ledger_journals,
  public.ledger_entries,
  public.audit_events,
  public.domain_outbox_events
TO zenfix_app;

COMMIT;
