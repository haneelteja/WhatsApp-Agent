-- Backfill contact_email for existing tenants using their earliest team member's email
UPDATE tenants t
SET contact_email = (
  SELECT au.email
  FROM auth.users au
  JOIN tenant_users tu ON tu.user_id = au.id
  WHERE tu.tenant_id = t.id
  ORDER BY tu.created_at ASC
  LIMIT 1
)
WHERE t.contact_email IS NULL;
