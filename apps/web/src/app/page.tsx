import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export default async function RootPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Use admin client to bypass RLS — we only need to know which role this user has
  const admin = getSupabaseAdminClient();

  const [{ data: platformUser }, { data: tenantUser }] = await Promise.all([
    admin.from('platform_users').select('id').eq('user_id', user.id).maybeSingle(),
    admin.from('tenant_users').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  if (platformUser) redirect('/platform/clients');
  if (tenantUser)   redirect('/dashboard');

  redirect('/login');
}
