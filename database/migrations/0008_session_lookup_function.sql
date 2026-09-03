-- Phase 6 — Authentication, Authorisation & Audit
--
-- Sessions are protected by the same RLS tenant-isolation pattern as
-- every other table (0007_auth_spine.sql), scoped by
-- `app.current_org_id`. But looking a session up BY ITS TOKEN is
-- inherently a chicken-and-egg problem: the caller does not know which
-- organisation the token belongs to until it reads the row — that is
-- the whole point of the lookup.
--
-- This narrow SECURITY DEFINER function is the deliberate, minimal
-- exception: it runs with the privileges of its owner (the
-- migration/owner role, which bypasses RLS) but does exactly one thing —
-- resolve an exact, unguessable token hash to an organisation_id, only
-- for a live (unrevoked, unexpired) session. It never returns any other
-- column, and it is granted to `psych_savings_runtime` for this purpose
-- only. Once the caller has the organisation_id, it sets
-- `app.current_org_id` and re-reads the session through the normal
-- RLS-scoped path, so the actual data read still goes through RLS.
CREATE FUNCTION lookup_session_organisation(p_token_hash text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organisation_id
  FROM sessions
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL
    AND expires_at > now();
$$;

REVOKE ALL ON FUNCTION lookup_session_organisation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_session_organisation(text) TO psych_savings_runtime;
