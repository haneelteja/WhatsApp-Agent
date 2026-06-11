import { getSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bot, Clock, MessageSquare, Copy } from 'lucide-react';

const PRODUCT_CONFIG: Record<string, { name: string; desc: string; textColor: string; bg: string; border: string }> = {
  support_bot:   { name: 'Support Bot',   desc: 'Q&A, issue resolution, escalations',  textColor: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200' },
  sales_bot:     { name: 'Sales Bot',     desc: 'Lead qualification & warm handoff',   textColor: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  lifecycle_bot: { name: 'Lifecycle Bot', desc: 'Orders, invoicing, payments',         textColor: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
};

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700 ring-emerald-200',
  trial:     'bg-sky-50 text-sky-700 ring-sky-200',
  suspended: 'bg-red-50 text-red-700 ring-red-200',
};

type TenantProductRow = { product_type: string; active: boolean; tier: string };
type BotConfigRow     = { product_slug: string; ai_model: string | null; confidence_threshold: number; system_prompt: string | null };
type TrialRow         = { ends_at: string; status: string; allowed_model: string; product_slug: string };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = await getSupabaseServerClient();

  const [
    { data: tenant },
    { data: products },
    { data: botConfigs },
    { data: trials },
    { count: convCount },
  ] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', tenantId).single(),
    supabase.from('tenant_products').select('product_type, active, tier').eq('tenant_id', tenantId),
    supabase.from('bot_configs').select('product_slug, ai_model, confidence_threshold, system_prompt').eq('tenant_id', tenantId),
    supabase.from('free_trials').select('ends_at, status, allowed_model, product_slug').eq('tenant_id', tenantId),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ]);

  if (!tenant) notFound();

  const tpRows    = (products   ?? []) as TenantProductRow[];
  const bcRows    = (botConfigs ?? []) as BotConfigRow[];
  const trialRows = (trials     ?? []) as TrialRow[];

  const activeTrial = trialRows.find(t => t.status === 'active');
  const trialDaysLeft = activeTrial
    ? Math.max(0, Math.ceil((new Date(activeTrial.ends_at).getTime() - Date.now()) / 86400000))
    : null;

  const activeProductCount = tpRows.filter(p => p.active).length;
  const statusBadge = STATUS_BADGE[tenant.status] ?? STATUS_BADGE.active;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/platform/clients" className="text-slate-400 hover:text-slate-600 transition-colors mt-1">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900">{tenant.name}</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 capitalize ${statusBadge}`}>
              {tenant.status}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{tenant.id}</p>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Plan',          value: tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1), color: 'text-slate-700' },
          { label: 'Conversations', value: String(convCount ?? 0),                                      color: 'text-indigo-700' },
          { label: 'Active Bots',   value: String(activeProductCount),                                 color: 'text-violet-700' },
          { label: 'Trial',         value: activeTrial ? `${trialDaysLeft}d left` : 'N/A',             color: activeTrial ? 'text-sky-700' : 'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs font-medium text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Products */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Assigned Products</h3>
          <p className="text-xs text-slate-400 mt-0.5">Bot configurations for this client</p>
        </div>

        {tpRows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-400">No products assigned yet.</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {tpRows.map(tp => {
              const cfg    = PRODUCT_CONFIG[tp.product_type];
              const botCfg = bcRows.find(bc => bc.product_slug === tp.product_type);
              if (!cfg) return null;

              return (
                <div
                  key={tp.product_type}
                  className={`rounded-xl border p-4 ${tp.active ? `${cfg.bg} ${cfg.border}` : 'bg-slate-50 border-slate-200 opacity-60'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tp.active ? 'bg-white border border-white/50' : 'bg-slate-100'}`}>
                      <Bot size={14} className={tp.active ? cfg.textColor : 'text-slate-400'} />
                    </div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tp.active ? 'bg-white/80 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      {tp.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <p className={`text-sm font-semibold ${tp.active ? cfg.textColor : 'text-slate-500'}`}>{cfg.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{cfg.desc}</p>

                  {botCfg && (
                    <div className="mt-3 pt-3 border-t border-white/40 space-y-1">
                      <p className="text-[10px] text-slate-500">
                        Model: <span className="font-semibold text-slate-700">{botCfg.ai_model ?? 'product default'}</span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Confidence: <span className="font-semibold text-slate-700">{botCfg.confidence_threshold}</span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Tier: <span className="font-semibold text-slate-700 capitalize">{tp.tier}</span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trial info */}
      {activeTrial && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Clock size={18} className="text-sky-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-sky-800">Active Free Trial</p>
              <p className="text-xs text-sky-600 mt-0.5">
                Expires {new Date(activeTrial.ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {' '}· {trialDaysLeft} days remaining
              </p>
              <p className="text-xs text-sky-500 mt-0.5">Allowed model: {activeTrial.allowed_model}</p>
            </div>
          </div>
        </div>
      )}

      {/* Webhook info */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-slate-400" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Webhook URLs</p>
        </div>
        <p className="text-xs text-slate-400">
          Configure these URLs in your WhatsApp provider (Twilio / Meta Cloud):
        </p>
        {tpRows.filter(p => p.active).length === 0 ? (
          <p className="text-xs text-slate-400">No active bots — assign products first.</p>
        ) : tpRows.filter(p => p.active).map(p => (
          <div key={p.product_type} className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-700 font-mono select-all">
              POST /api/webhook/{tenant.id}/{p.product_type}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
