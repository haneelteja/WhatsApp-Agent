import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { RefreshCw, Info } from 'lucide-react';
import { CollapsibleCard } from '@/components/CollapsibleCard';
import { FollowUpForm } from '@/components/dashboard/FollowUpForm';

const BOT_META: Record<string, { name: string; desc: string; color: string; bg: string; border: string; accent: string }> = {
  support_bot:   { name: 'Support Bot',   desc: 'Customer Q&A and issue resolution',   color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200',    accent: 'sky'    },
  sales_bot:     { name: 'Sales Bot',     desc: 'Lead qualification & warm handoff',   color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', accent: 'violet' },
  lifecycle_bot: { name: 'Lifecycle Bot', desc: 'Orders, invoicing, payments',         color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', accent: 'orange' },
};

type FollowUpConfig = {
  enabled:          boolean;
  idle_days:        number;
  message_template: string;
  max_follow_ups:   number;
};

export default async function FollowUpsPage() {
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

  const [{ data: products }, { data: configs }] = await Promise.all([
    admin
      .from('tenant_products')
      .select('product_type')
      .eq('tenant_id', tenantId)
      .eq('active', true),
    admin
      .from('follow_up_configs')
      .select('product_slug, enabled, idle_days, message_template, max_follow_ups')
      .eq('tenant_id', tenantId),
  ]);

  const configMap = new Map<string, FollowUpConfig>(
    (configs ?? []).map(c => [c.product_slug, c as FollowUpConfig])
  );

  const activeSlugs = (products ?? []).map(p => p.product_type);

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Follow-ups</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Automatically re-engage customers who go quiet.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Info size={13} className="text-emerald-600 shrink-0" />
          <p className="text-xs font-semibold text-emerald-800">How it works</p>
        </div>
        <ul className="list-disc ml-4 space-y-1 text-xs text-emerald-700">
          <li>When a customer goes silent for the configured idle days, the bot sends them your follow-up message</li>
          <li>Each follow-up resets the idle clock — the customer won&apos;t be messaged again until the same idle period passes</li>
          <li>Max follow-ups limits how many times a single conversation is followed up before the bot stops</li>
          <li>Only <strong>open</strong> conversations are eligible — resolved or escalated ones are skipped</li>
        </ul>
      </div>

      {/* Per-bot cards */}
      {activeSlugs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm flex flex-col items-center justify-center py-12 text-center">
          <RefreshCw size={24} className="text-gray-300 mb-3" />
          <p className="text-sm font-semibold text-gray-500">No active bots</p>
          <p className="text-xs text-gray-400 mt-1">Activate bots from your settings to configure follow-ups.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeSlugs.map(slug => {
            const meta   = BOT_META[slug];
            if (!meta) return null;

            const cfg = configMap.get(slug);
            const isEnabled   = cfg?.enabled ?? false;
            const idleDays    = cfg?.idle_days ?? 3;
            const template    = cfg?.message_template ?? '';
            const maxSends    = cfg?.max_follow_ups ?? 1;

            const header = (
              <div className="flex items-center gap-3 w-full min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg} border ${meta.border}`}>
                  <RefreshCw size={13} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${meta.color}`}>{meta.name}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isEnabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                      {isEnabled ? `On · ${idleDays}d idle` : 'Off'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{meta.desc}</p>
                </div>
              </div>
            );

            return (
              <CollapsibleCard
                key={slug}
                header={header}
                borderClass={meta.border}
                defaultOpen={false}
              >
                <FollowUpForm
                  productSlug={slug}
                  productName={meta.name}
                  accent={meta.accent}
                  initialEnabled={isEnabled}
                  initialIdleDays={idleDays}
                  initialTemplate={template}
                  initialMaxSends={maxSends}
                />
              </CollapsibleCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
