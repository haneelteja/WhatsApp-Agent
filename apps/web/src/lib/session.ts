import { cache } from 'react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';

export type Session = {
  userId:    string;
  userEmail: string | null;
  tenantId:  string;
  role:      string;
};

// React.cache() deduplicates within a single RSC render pass.
// All server action files import this instead of replicating the two-step
// auth.getUser() + tenant_users lookup, so it fires at most once per request.
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdminClient();
  const { data: tu } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();
  if (!tu) return null;

  return {
    userId:    user.id,
    userEmail: user.email ?? null,
    tenantId:  tu.tenant_id as string,
    role:      tu.role as string,
  };
});
