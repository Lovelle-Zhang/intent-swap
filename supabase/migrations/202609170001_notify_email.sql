-- Verified-payment email notifications (owner-facing). Two additive changes:
--
--  1. policies.notify_email_enabled — per-workspace on/off for the "verified
--     on-chain" receipt email. Default TRUE (opt-out): a verified Pay Run emails
--     the owner unless they turn it off on the Policy page.
--
--  2. zenfix_owner_email(uid) — a SECURITY DEFINER lookup returning the owner's
--     email for a user id. The execution/report path authenticates by API key
--     (no browser session), so it has no email in context; this resolves it.
--     Mirrors zenfix_resolve_api_key exactly: plpgsql (late-bound, so it creates
--     even where auth.users has no email column yet), RLS-exempt as the definer,
--     and locked down — revoked from PUBLIC and the Supabase runtime roles,
--     executable only by zenfix_app.
--
-- Additive migration. Depends on 202607150001 (zenfix_app, auth.users) and
-- 202609070008 (policies.notify_webhook_url lives on the same settings row).

BEGIN;

ALTER TABLE public.policies
  ADD COLUMN notify_email_enabled boolean NOT NULL DEFAULT true;

CREATE FUNCTION public.zenfix_owner_email(owner_uid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $owner_email$
DECLARE
  resolved text;
BEGIN
  SELECT email INTO resolved FROM auth.users WHERE id = owner_uid;
  RETURN resolved;
END
$owner_email$;

REVOKE ALL ON FUNCTION public.zenfix_owner_email(uuid) FROM PUBLIC;

DO $revoke_supabase_roles$
DECLARE
  runtime_role text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.zenfix_owner_email(uuid) FROM %I', runtime_role);
    END IF;
  END LOOP;
END
$revoke_supabase_roles$;

GRANT EXECUTE ON FUNCTION public.zenfix_owner_email(uuid) TO zenfix_app;

COMMIT;
