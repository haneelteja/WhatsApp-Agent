import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { NewOrderForm } from '@/components/dashboard/NewOrderForm';

export default async function NewOrderPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  const tenantId = tenantUser?.tenant_id ?? '';

  const { data: contacts } = await admin
    .from('contacts')
    .select('id, phone, name')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
    .limit(500);

  const { data: conversations } = await admin
    .from('conversations')
    .select('id, contact_id, product_type, created_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(100);

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">New Order</h2>
        <p className="text-sm text-gray-500 mt-0.5">Create an order and send a PhonePe payment link via WhatsApp</p>
      </div>
      <NewOrderForm
        tenantId={tenantId}
        contacts={contacts ?? []}
        conversations={conversations ?? []}
      />
    </div>
  );
}
