\set ON_ERROR_STOP on
BEGIN;
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

SELECT
  EXISTS (SELECT 1 FROM users WHERE external_identity_id = :'clerk_user_id'
    AND email_verified AND NOT is_platform_admin) AND NOT EXISTS (SELECT 1 FROM users WHERE is_platform_admin)
    AND NOT EXISTS (SELECT 1 FROM platform_admin_bootstraps) AS can_grant,
  EXISTS (SELECT 1 FROM users u JOIN platform_admin_bootstraps a ON a.target_user_id = u.id
    WHERE u.external_identity_id = :'clerk_user_id' AND u.email_verified AND u.is_platform_admin) AS already_granted
\gset

\if :can_grant
WITH granted AS (
  UPDATE users SET is_platform_admin = true WHERE external_identity_id = :'clerk_user_id'
  RETURNING id
)
INSERT INTO platform_admin_bootstraps (target_user_id, database_role)
SELECT id, current_user FROM granted;
\elif :already_granted
\echo Platform administrator bootstrap already applied.
\else
ROLLBACK;
DO $$ BEGIN RAISE EXCEPTION 'Bootstrap requires an existing verified identity and an unused first-admin grant'; END $$;
\endif

COMMIT;
