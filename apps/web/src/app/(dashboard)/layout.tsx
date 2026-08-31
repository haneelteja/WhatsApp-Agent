import { cache }    from 'react';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard-shell';
import type { CopilotMessage } from '@/components/dashboard/CopilotWidget';

// Code-split the widget — it's ~15 KB of JS not needed for initial paint or SSR.
const CopilotWidget = dynamic(
  () => import('@/components/dashboard/CopilotWidget').then(m => ({ default: m.CopilotWidget })),
  { ssr: false },
);

// React.cache() deduplicates within a single server request — the layout and
// any child server components share one DB round-trip instead of making N.
const getTenantContext = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdminClient();
  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('role, tenant_id, tenants(name, copilot_config)')
    .eq('user_id', user.id)
    .single();

  if (!tenantUser) return null;

  const tenantId  = tenantUser.tenant_id ?? '';
  const tenantsRaw = tenantUser.tenants as unknown;
  const tenantObj  = Array.isArray(tenantsRaw)
    ? (tenantsRaw[0] as { name: string; copilot_config?: Record<string, unknown> })
    : (tenantsRaw as { name: string; copilot_config?: Record<string, unknown> } | null);

  const rawCfg      = tenantObj?.copilot_config ?? {};
  const copilotEnabled = typeof rawCfg['enabled'] === 'boolean' ? rawCfg['enabled'] : true;

  const [{ data: lb }, { data: sb }] = await Promise.all([
    admin.from('tenant_products').select('product_type')
      .eq('tenant_id', tenantId).eq('product_type', 'lifecycle_bot').eq('active', true).maybeSingle(),
    admin.from('tenant_products').select('product_type')
      .eq('tenant_id', tenantId).eq('product_type', 'sales_bot').eq('active', true).maybeSingle(),
  ]);

  return {
    user,
    tenantName:      tenantObj?.name ?? 'Dashboard',
    userRole:        tenantUser.role ?? '',
    tenantId,
    copilotEnabled,
    hasLifecycleBot: !!lb,
    hasSalesBot:     !!sb,
  };
});

export { getTenantContext };

// Cached copilot history loader — only called when copilot is enabled.
// React.cache() ensures that if the layout and a child both call this, it runs once.
const getCopilotHistory = cache(async (userId: string, tenantId: string) => {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('copilot_messages')
    .select('id, role, content, pending_action, action_status')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(30);
  return data ?? [];
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  // Skip the 30-row message fetch entirely when copilot is disabled.
  const historyRows = ctx.copilotEnabled
    ? await getCopilotHistory(ctx.user.id, ctx.tenantId)
    : [];

  const initialMessages: CopilotMessage[] = (historyRows as Array<{
    id:             string;
    role:           string;
    content:        string;
    pending_action: Record<string, unknown> | null;
    action_status:  string | null;
  }>).reverse().map(m => ({
    id:           m.id,
    role:         m.role as 'user' | 'assistant',
    content:      m.content,
    type:         m.pending_action ? 'action_pending' : 'message',
    toolName:     (m.pending_action?.['toolName']  as string | undefined),
    toolInput:    (m.pending_action?.['toolInput']  as Record<string, unknown> | undefined),
    toolUseId:    (m.pending_action?.['toolUseId'] as string | undefined),
    actionStatus: m.action_status as CopilotMessage['actionStatus'],
  }));

  return (
    <>
      <DashboardShell
        tenantName={ctx.tenantName}
        email={ctx.user.email ?? ''}
        userRole={ctx.userRole}
        hasLifecycleBot={ctx.hasLifecycleBot}
      >
        {children}
      </DashboardShell>
      {ctx.copilotEnabled && <CopilotWidget initialMessages={initialMessages} />}
    </>
  );
}
