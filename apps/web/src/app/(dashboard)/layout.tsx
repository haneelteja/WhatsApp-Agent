import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { DashboardNav } from '@/components/dashboard-nav';
import { Topbar } from '@/components/topbar';
import { CopilotWidget, type CopilotMessage } from '@/components/dashboard/CopilotWidget';

// React.cache() deduplicates this call within a single server request.
// The layout and any child server components that also call getTenantContext()
// will share one result instead of each making 2 DB round-trips.
const getTenantContext = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdminClient();
  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('role, tenant_id, tenants(name)')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return null;

  const tenantId = tenantUser.tenant_id ?? '';

  const [{ data: lb }, { data: sb }] = await Promise.all([
    admin.from('tenant_products').select('product_type')
      .eq('tenant_id', tenantId).eq('product_type', 'lifecycle_bot').eq('active', true).maybeSingle(),
    admin.from('tenant_products').select('product_type')
      .eq('tenant_id', tenantId).eq('product_type', 'sales_bot').eq('active', true).maybeSingle(),
  ]);

  const tenantsRaw = tenantUser.tenants as unknown;
  const tenantObj  = Array.isArray(tenantsRaw) ? (tenantsRaw[0] as { name: string }) : (tenantsRaw as { name: string } | null);

  return {
    user,
    tenantName:    tenantObj?.name ?? 'Dashboard',
    userRole:      tenantUser.role ?? '',
    tenantId,
    hasLifecycleBot: !!lb,
    hasSalesBot:     !!sb,
  };
});

export { getTenantContext };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const admin = getSupabaseAdminClient();
  const { data: historyRows } = await admin
    .from('copilot_messages')
    .select('id, role, content, pending_action, action_status')
    .eq('user_id', ctx.user.id)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(30);

  const initialMessages: CopilotMessage[] = ((historyRows ?? []) as Array<{
    id: string;
    role: string;
    content: string;
    pending_action: Record<string, unknown> | null;
    action_status: string | null;
  }>).reverse().map(m => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    type: m.pending_action ? 'action_pending' : 'message',
    toolName: (m.pending_action?.['toolName'] as string | undefined),
    toolInput: (m.pending_action?.['toolInput'] as Record<string, unknown> | undefined),
    toolUseId: (m.pending_action?.['toolUseId'] as string | undefined),
    actionStatus: m.action_status as CopilotMessage['actionStatus'],
  }));

  return (
    <div className="flex h-screen bg-[#f3fdf5] overflow-hidden">
      <DashboardNav tenantName={ctx.tenantName} userRole={ctx.userRole} hasLifecycleBot={ctx.hasLifecycleBot} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar email={ctx.user.email ?? ''} tenantName={ctx.tenantName} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CopilotWidget initialMessages={initialMessages} />
    </div>
  );
}
