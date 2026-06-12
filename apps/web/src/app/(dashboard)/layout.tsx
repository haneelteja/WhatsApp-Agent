import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { DashboardNav } from '@/components/dashboard-nav';
import { Topbar } from '@/components/topbar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const admin = getSupabaseAdminClient();
  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('role, tenant_id, tenants(name)')
    .eq('user_id', user.id)
    .single();

  const tenantsRaw = tenantUser?.tenants as unknown;
  const tenantObj  = Array.isArray(tenantsRaw) ? (tenantsRaw[0] as { name: string }) : (tenantsRaw as { name: string } | null);
  const tenantName = tenantObj?.name ?? 'Dashboard';
  const userRole   = tenantUser?.role ?? '';

  return (
    <div className="flex h-screen bg-[#f3fdf5] overflow-hidden">
      <DashboardNav tenantName={tenantName} userRole={userRole} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar email={user.email ?? ''} tenantName={tenantName} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
