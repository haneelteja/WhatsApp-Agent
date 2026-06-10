import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardNav } from '@/components/dashboard-nav';
import { Topbar } from '@/components/topbar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <DashboardNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar email={user.email ?? ''} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
