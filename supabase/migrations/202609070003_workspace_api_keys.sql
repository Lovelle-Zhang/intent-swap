-- Workspace API keys (2B-intake auth).
--
-- Per-workspace bearer keys let a real external agent authenticate to the
-- intake API without a browser session. Only a SHA-256 hash of each key is
-- stored; the plaintext is shown once at creation. The owner manages their own
-- keys under the normal zenfix_app RLS. Inbound auth, which has no tenant
-- context yet, resolves a key hash to its owner via a SECURITY DEFINER function
-- that returns only the owner id for an exact live-key match.
--
-- Additive migration. Depends on 202607150001 for the zenfix_app role and
-- auth.users.

BEGIN;

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX api_keys_owner_idx ON public.api_keys (owner_user_id);

-- ENABLE (not FORCE) RLS: the app role zenfix_app sees only its own keys, while
-- the SECURITY DEFINER resolver below runs as the table owner (RLS-exempt) so it
-- can look a key up before any tenant context exists.
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_owner_select ON public.api_keys
  FOR SELECT TO zenfix_app
  USING (owner_user_id = public.zenfix_current_uid());
CREATE POLICY api_keys_owner_insert ON public.api_keys
  FOR INSERT TO zenfix_app
  WITH CHECK (owner_user_id = public.zenfix_current_uid());
CREATE POLICY api_keys_owner_update ON public.api_keys
  FOR UPDATE TO zenfix_app
  USING (owner_user_id = public.zenfix_current_uid())
  WITH CHECK (owner_user_id = public.zenfix_current_uid());

CREATE FUNCTION public.zenfix_resolve_api_key(candidate_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $resolve$
DECLARE
  resolved uuid;
BEGIN
  UPDATE public.api_keys
     SET last_used_at = transaction_timestamp()
   WHERE key_hash = candidate_hash AND revoked_at IS NULL
  RETURNING owner_user_id INTO resolved;
  RETURN resolved;
END
$resolve$;

REVOKE ALL ON TABLE public.api_keys FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zenfix_resolve_api_key(text) FROM PUBLIC;

DO $revoke_supabase_roles$
DECLARE
  runtime_role text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.api_keys FROM %I', runtime_role);
    END IF;
  END LOOP;
END
$revoke_supabase_roles$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.api_keys TO zenfix_app;
GRANT EXECUTE ON FUNCTION public.zenfix_resolve_api_key(text) TO zenfix_app;

COMMIT;
