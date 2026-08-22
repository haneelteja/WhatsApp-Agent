import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ButtonTemplatesManager } from '@/components/dashboard/ButtonTemplatesManager';
import type { ButtonTemplateRow } from '@/app/actions/button-templates';

export const metadata = { title: 'Button Templates' };

export default async function ButtonTemplatesPage() {
  const supabase  = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdminClient();
  const { data: tu } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  const tenantId = tu?.tenant_id ?? null;
  let initialTemplates: ButtonTemplateRow[] = [];

  if (tenantId) {
    const { data } = await admin
      .from('interactive_button_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    initialTemplates = (data ?? []) as ButtonTemplateRow[];
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Button Templates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Define reusable WhatsApp interactive button menus. The AI references these by name and sends them automatically at key decision points.
          </p>
        </div>
        <ButtonTemplatesManager initialTemplates={initialTemplates} />
      </div>
    </div>
  );
}
