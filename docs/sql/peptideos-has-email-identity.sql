-- Read-only boolean: does this PeptideOS auth.users.id have an email/password identity?
-- Granted only to WC's database login role (`postgres` on this shared project).
-- Do not apply from this PR automatically. See docs/peptideos-change-password.md for deploy order.
--
-- Rollback: docs/sql/peptideos-has-email-identity.rollback.sql

CREATE OR REPLACE FUNCTION wc.peptideos_has_email_identity(p_auth_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.identities
    WHERE user_id = p_auth_user_id
      AND provider = 'email'
  );
$$;

COMMENT ON FUNCTION wc.peptideos_has_email_identity(uuid) IS
  'Read-only boolean: auth.identities has provider=email for this auth.users.id. No identity rows or secrets are returned.';

REVOKE ALL ON FUNCTION wc.peptideos_has_email_identity(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION wc.peptideos_has_email_identity(uuid) TO postgres;
