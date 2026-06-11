import { getSupabaseServerClient } from '@/lib/supabase/server';
import { Building2, Phone, Bot, Link2, ShieldAlert } from 'lucide-react';
import { BotConfigForm } from '@/components/dashboard/BotConfigForm';
import type { BotConfig, Product } from '@alphabot/shared';

const PRODUCT_COLORS: Record<string, string> = {
  support_bot:   'bg-sky-50 text-sky-600',
  sales_bot:     'bg-violet-50 text-violet-600',
  lifecycle_bot: 'bg-orange-50 text-orange-600',
};

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();

  const [{ data: tenant }, { data: numbers }, { data: products }, { data: botConfigs }, { data: productCatalog }] =
    await Promise.all([
      supabase.from('tenants').select('*').single(),
      supabase.from('whatsapp_numbers').select('*'),
      supabase.from('tenant_products').select('*'),
      supabase.from('bot_configs').select('*, product:products(slug, default_prompt, default_model, name)'),
      supabase.from('products').select('slug, default_prompt'),
    ]);

  const apiBase    = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://your-api.onrender.com';
  const webhookUrl = tenant?.id
    ? `${apiBase}/api/webhook/${tenant.id}/support_bot`
    : null;

  // Build product default prompts map
  const productDefaults: Record<string, string> = {};
  for (const p of productCatalog ?? []) {
    productDefaults[p.slug] = p.default_prompt;
  }

  const resolvedConfigs = (botConfigs ?? []) as (BotConfig & { product: Product | null })[];

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
        {!numbers?.length ? (
          <p className="text-sm text-gray-400 px-5 py-4">No numbers configured.</p>
        ) : (
          numbers.map((num) => {
            const config = num.config_json as Record<string, string>;
            return (
              <div key={num.id} className="divide-y divide-green-50">
                <InfoRow label="Phone Number" value={num.phone_number}                        mono />
                <InfoRow label="Provider"     value={num.provider}                            capitalize />
                <InfoRow label="Number ID"    value={config['phone_number_id'] ?? '—'}        mono />
              </div>
            );
          })
        )}
      </Section>

      {/* Active bots */}
      <Section icon={<Bot size={16} />} title="Active Bot Products">
        {!products?.length ? (
          <p className="text-sm text-gray-400 px-5 py-4">No products activated.</p>
        ) : (
          <div className="divide-y divide-green-50">
            {products.map((p) => (
              <div
                key={`${p.tenant_id}-${p.product_type}`}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${PRODUCT_COLORS[p.product_type] ?? 'bg-gray-100 text-gray-500'}`}>
                    {p.product_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm text-gray-500 capitalize">{p.tier}</span>
                </div>
                <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ring-1 ${p.active ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-gray-100 text-gray-500 ring-gray-200'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${p.active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                  {p.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Bot Configuration (editable) */}
      <Section icon={<ShieldAlert size={16} />} title="Bot Configuration & Guardrails">
        <div className="px-5 py-4 space-y-1">
          <p className="text-xs text-gray-400">
            Configure system prompts, KB-only mode, tone, blocked topics, and response guardrails per bot.
            Click a bot to expand its settings.
          </p>
        </div>
        <div className="px-5 pb-5">
          <BotConfigForm configs={resolvedConfigs} productDefaults={productDefaults} />
        </div>
      </Section>

      {/* Webhook URL */}
      {webhookUrl && (
        <Section icon={<Link2 size={16} />} title="Webhook URL">
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs text-gray-400">
              Set this as the webhook in your WhatsApp provider settings (Twilio Sandbox → &ldquo;When a message comes in&rdquo;)
            </p>
            <div className="flex items-center gap-2 bg-green-50 rounded-xl border border-green-100 px-4 py-3">
              <code className="flex-1 text-xs text-emerald-700 break-all font-mono">{webhookUrl}</code>
            </div>
          </div>
        </Section>
      )}
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
