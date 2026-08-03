import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { NewCampaignForm } from './NewCampaignForm';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  const tenantId = tenantUser?.tenant_id ?? '';

  const { data: products } = await admin
    .from('tenant_products')
    .select('product_type')
    .eq('tenant_id', tenantId)
    .eq('active', true);

  const productSlugs = (products ?? []).map(
    (p: { product_type: string }) => p.product_type,
  );

  const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">New Campaign</h2>
        <p className="text-sm text-gray-500 mt-0.5">Bulk outbound — WhatsApp, voice calls, or both</p>
      </div>
      <NewCampaignForm tenantId={tenantId} productSlugs={productSlugs} apiBase={apiBase} />
    </div>
  );
}
