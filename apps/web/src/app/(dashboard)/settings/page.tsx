import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { Building2, Phone, Bot, Link2, ShieldCheck, Bell } from 'lucide-react';
import Link from 'next/link';
import { WhatsAppSetupSection } from '@/components/dashboard/WhatsAppSetupSection';
import { NotificationSettings } from '@/components/dashboard/NotificationSettings';
import { BotProductsSection } from '@/components/dashboard/BotProductsSection';
import { WhatsAppNumbersManager } from '@/components/dashboard/WhatsAppNumbersManager';

const PRODUCT_COLORS: Record<string, string> = {
  support_bot:   'bg-sky-50 text-sky-600',
  sales_bot:     'bg-violet-50 text-violet-600',
  lifecycle_bot: 'bg-orange-50 text-orange-600',
};

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? '';

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', userId)
    .single();

  const tenantId = tenantUser?.tenant_id ?? '';

  const [{ data: tenant }, { data: numbers }, { data: products }, { data: notifSettings }] =
    await Promise.all([
      admin.from('tenants').select('*').eq('id', tenantId).single(),
      admin.from('whatsapp_numbers').select('*').eq('tenant_id', tenantId),
      admin.from('tenant_products').select('*').eq('tenant_id', tenantId),
      admin.from('tenant_notification_settings').select('*').eq('tenant_id', tenantId).single(),
    ]);

  const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://your-api.onrender.com';

  const activeBots = (products ?? []).filter(p => p.active);

  // Build per-bot webhook info
  const botWebhooks = activeBots.map(p => {
    const wn = (numbers ?? []).find(n => n.product_slug === p.product_type);
    const config = (wn?.config_json ?? {}) as Record<string, string>;
    return {
      productType: p.product_type,
      webhookUrl: tenant?.id
        ? `${apiBase}/api/webhook/${tenant.id}/${p.product_type}`
        : '',
      verifyToken: config['verify_token'] ?? null,
      phoneNumber: wn?.phone_number ?? null,
      configured: !!wn,
    };
  });

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Your workspace and bot configuration</p>
      </div>

      {/* Workspace */}
      <Section icon={<Building2 size={16} />} title="Workspace">
        <div className="divide-y divide-green-50">
          <InfoRow label="Name"      value={tenant?.name ?? '—'} />
          <InfoRow label="Plan"      value={tenant?.plan ?? '—'}      capitalize />
          <InfoRow label="Status"    value={tenant?.status ?? '—'}    capitalize />
          <InfoRow label="Provider"  value={tenant?.provider ?? '—'}  capitalize />
          <InfoRow label="Tenant ID" value={tenant?.id ?? '—'}        mono />
        </div>
      </Section>

      {/* WhatsApp numbers */}
      <Section icon={<Phone size={16} />} title="WhatsApp Numbers">
        <WhatsAppNumbersManager
          numbers={(numbers ?? []).map(n => ({
            id: n.id as string,
            phone_number: n.phone_number as string,
            provider: n.provider as string,
            label: (n.label ?? null) as string | null,
            product_slug: (n.product_slug ?? null) as string | null,
            phone_number_id: ((n.config_json as Record<string, string>)['phone_number_id'] ?? null),
          }))}
          activeBots={activeBots.map(p => p.product_type as 'support_bot' | 'sales_bot' | 'lifecycle_bot')}
          webhookBase={`${apiBase}/api/webhook/${tenant?.id ?? ''}`}
        />
      </Section>

      {/* Bot Products — activate / deactivate / assign numbers */}
      <Section icon={<Bot size={16} />} title="Bot Products">
        <BotProductsSection
          tenantId={tenant?.id ?? ''}
          apiBase={apiBase}
          tenantProducts={(products ?? []) as { product_type: string; tier: string; active: boolean }[]}
          numbers={(numbers ?? []).map(n => ({
            id: n.id as string,
            phone_number: n.phone_number as string,
            provider: n.provider as string,
            label: (n.label ?? null) as string | null,
            product_slug: (n.product_slug ?? null) as string | null,
          }))}
        />
      </Section>

      {/* Guardrails moved notice */}
      <Section icon={<ShieldCheck size={16} />} title="Guardrails">
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500">
            Bot guardrails are managed in the dedicated{' '}
            <Link href="/guardrails" className="text-emerald-600 font-semibold underline">Guardrails</Link> section.
          </p>
        </div>
      </Section>

      {/* Meta Cloud API / Webhook Setup */}
      {activeBots.length > 0 && (
        <Section icon={<Link2 size={16} />} title="Meta Cloud API & Webhook Setup">
          <div className="px-5 py-4">
            <WhatsAppSetupSection bots={botWebhooks} />
          </div>
        </Section>
      )}

      {/* Escalation Notifications */}
      <Section icon={<Bell size={16} />} title="Escalation Notifications">
        <NotificationSettings
          initialEmails={(notifSettings?.escalation_emails as string[] | null) ?? []}
          initialWaNumbers={(notifSettings?.escalation_wa_numbers as string[] | null) ?? []}
          initialCustomerMessage={notifSettings?.escalation_customer_message ?? 'Your query has been escalated to our team. A team member will get back to you shortly.'}
        />
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-green-50">
        <span className="text-emerald-600">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  capitalize = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span
        className={`text-right truncate max-w-[60%] ${
          mono ? 'font-mono text-xs text-gray-600 bg-green-50 px-2 py-0.5 rounded-md' : 'text-sm text-gray-700'
        } ${capitalize ? 'capitalize' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
