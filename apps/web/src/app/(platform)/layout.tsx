import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { PlatformNav } from '@/components/platform-nav';
import { PlatformTopbar } from '@/components/platform-topbar';

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Only platform users can access this layout
  const { data: platformUser } = await supabase
    .from('platform_users')
    .select('role, name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!platformUser) redirect('/login');

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <PlatformNav role={platformUser.role} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <PlatformTopbar
          email={user.email ?? ''}
          name={platformUser.name ?? user.email?.split('@')[0] ?? ''}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
