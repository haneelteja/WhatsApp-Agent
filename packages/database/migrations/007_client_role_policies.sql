-- ============================================================================
-- Alphabot — Client Role RLS Policies
--
-- Run AFTER 006_client_invites.sql.
-- Fixes missing SELECT policies for client_manager and client_admin roles.
-- The initial schema only covered admin/supervisor/agent but not the client
-- tenant roles introduced by the invite flow.
-- ============================================================================

SET ROLE postgres;

-- Conversations
create policy "conversations: client manager/admin see all"
  on conversations for select
  using (
    tenant_id = get_user_tenant_id()
    and get_user_role() in ('client_manager', 'client_admin')
  );

-- Messages
create policy "messages: client manager/admin read"
  on messages for select
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.tenant_id = get_user_tenant_id()
        and get_user_role() in ('client_manager', 'client_admin')
    )
  );

-- Escalations
create policy "escalations: client manager/admin read"
  on escalations for select
  using (
    tenant_id = get_user_tenant_id()
    and get_user_role() in ('client_manager', 'client_admin')
  );

-- Contacts (already has a read policy but only covers insert/update, not the role gap)
create policy "contacts: client manager/admin read"
  on contacts for select
  using (
    tenant_id = get_user_tenant_id()
    and get_user_role() in ('client_manager', 'client_admin')
  );
