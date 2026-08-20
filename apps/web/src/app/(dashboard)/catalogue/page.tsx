import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ProductCatalogueManager } from './ProductCatalogueManager';
import type { ProductCatalogueItem } from '@alphabot/shared';

export default async function CataloguePage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = getSupabaseAdminClient();

  const { data: tu } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!tu?.tenant_id) redirect('/login');

  const { data } = await admin
    .from('product_catalogue')
    .select('*')
    .eq('tenant_id', tu.tenant_id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  const products = (data ?? []) as ProductCatalogueItem[];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Product Catalogue</h1>
        <p className="text-sm text-slate-500 mt-1">
          Active products are injected into the sales bot — it can quote exact prices in chat and send a formatted product list on request.
        </p>
      </div>
      <ProductCatalogueManager initialProducts={products} />
    </div>
  );
}
