-- Grant missing table-level permissions for kb_media_attachments.
-- Migration 019 created the table but omitted the GRANT, causing
-- "permission denied" errors even with the service role.

GRANT ALL ON TABLE kb_media_attachments TO anon, authenticated, service_role;
