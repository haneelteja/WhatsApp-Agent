import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export default async function RootPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Platform users → platform console
  const { data: platformUser } = await supabase
    .from('platform_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (platformUser) redirect('/platform/clients');

  // Client users → client dashboard
  const { data: tenantUser } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (tenantUser) redirect('/dashboard');

  redirect('/login');
}
