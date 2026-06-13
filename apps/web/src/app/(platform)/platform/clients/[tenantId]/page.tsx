import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bot, Clock, MessageSquare, Users, ShieldAlert, Cpu, Phone } from 'lucide-react';
import { TenantGuardrailsForm } from '@/components/platform/TenantGuardrailsForm';
import { ClientProductsManager } from '@/components/platform/ClientProductsManager';
import { LlmConfigCard } from '@/components/LlmConfigCard';
import type { LlmConfigCardProps } from '@/components/LlmConfigCard';
import { saveTenantGuardrailsByIdAction } from '@/app/actions/tenant-guardrails';
import type { LayeredGuardrailsConfig } from '@alphabot/shared';
import { InviteUserForm } from '@/components/platform/InviteUserForm';
import { WhatsAppNumberSection } from '@/components/platform/WhatsAppNumberSection';

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
  const supabase = getSupabaseAdminClient();

  const [
    { data: tenant },
    { data: products },
    { data: botConfigs },
    { data: trials },
    { count: convCount },
    { data: tenantUsers },
    { data: pendingInvites },
    { data: tenantGuardrailsRow },
    { data: llmConfigRows },
    { data: waNumbers },
  ] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', tenantId).single(),
    supabase.from('tenant_products').select('product_type, active, tier').eq('tenant_id', tenantId),
    supabase.from('bot_configs').select('product_slug, ai_model, confidence_threshold, system_prompt').eq('tenant_id', tenantId),
    supabase.from('free_trials').select('ends_at, status, allowed_model, product_slug').eq('tenant_id', tenantId),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('tenant_users').select('user_id, role, created_at').eq('tenant_id', tenantId),
    supabase.from('client_invites').select('email, role, created_at, expires_at').eq('tenant_id', tenantId).is('accepted_at', null),
    supabase.from('tenant_guardrails').select('guardrails_json').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('llm_configs').select('id, product_slug, provider, api_key, model, base_url, validation_status, validation_error, validated_at, credit_info, created_at').eq('tenant_id', tenantId),
    supabase.from('whatsapp_numbers').select('id, phone_number, provider, label, config_json, product_slug').eq('tenant_id', tenantId).eq('active', true),
  ]);

  // Fetch auth user details for team members
  const userIds = (tenantUsers ?? []).map(u => u.user_id);
  const authUsers: Record<string, { email: string; name: string }> = {};
  if (userIds.length > 0) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users) {
      if (userIds.includes(u.id)) {
        authUsers[u.id] = {
          email: u.email ?? '',
          name:  (u.user_metadata?.['full_name'] as string) ?? u.email ?? u.id,
        };
      }
    }
  }

  if (!tenant) notFound();

  // Filter out pending invites for emails that are already active members
  type InviteRow = { email: string; role: string; created_at: string; expires_at: string };
  const activeEmails = new Set(Object.values(authUsers).map(u => u.email.toLowerCase()));
  const filteredPendingInvites: InviteRow[] = ((pendingInvites ?? []) as InviteRow[]).filter(
    (inv: InviteRow) => !activeEmails.has(inv.email.toLowerCase())
  );

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

      {/* Products — interactive manager */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Assigned Products</h3>
          <p className="text-xs text-slate-400 mt-0.5">Activate or deactivate bots for this client</p>
        </div>
        <div className="p-4">
          <ClientProductsManager tenantId={tenantId} initialProducts={tpRows} />
        </div>
      </div>

      {/* WhatsApp Numbers */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
          <Phone size={15} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800">WhatsApp Numbers</h3>
          <span className="ml-auto text-xs text-slate-400">One number per bot</span>
        </div>
        <div className="px-6 py-4">
          <p className="text-xs text-slate-400 mb-4">
            Each active bot needs its own WhatsApp number. The webhook URL for each bot is shown below.
          </p>
          <WhatsAppNumberSection
            tenantId={tenantId}
            activeBots={tpRows.filter(p => p.active)}
            waNumbers={(waNumbers ?? []) as { id: string; phone_number: string; provider: string; label: string | null; config_json: Record<string, string>; product_slug: string | null }[]}
          />
        </div>
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

      {/* Team & Invites */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
          <Users size={15} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800">Team Members</h3>
          <span className="ml-auto text-xs text-slate-400">
            {(tenantUsers ?? []).length} active
            {filteredPendingInvites.length > 0 && ` · ${filteredPendingInvites.length} pending`}
          </span>
        </div>
        <div className="px-6 py-4 space-y-4">
          {(tenantUsers ?? []).length > 0 && (
            <div className="divide-y divide-slate-50">
              {(tenantUsers ?? []).map(u => {
                const info = authUsers[u.user_id];
                const joinedAt = new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <div key={u.user_id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-700">{info?.name ?? u.user_id}</p>
                        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-semibold ring-1 ring-emerald-200">Active</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{info?.email ?? ''} · Joined {joinedAt}</p>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium capitalize">
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {filteredPendingInvites.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Pending Invites</p>
              <div className="divide-y divide-slate-50">
                {filteredPendingInvites.map(inv => {
                  const isExpired = new Date(inv.expires_at) < new Date();
                  const sentAt = new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <div key={inv.email + inv.created_at} className="flex items-center justify-between py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-500">{inv.email}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ring-1 ${isExpired ? 'bg-red-50 text-red-600 ring-red-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                            {isExpired ? 'Expired' : 'Pending'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">Invited {sentAt}</p>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium capitalize">
                        {inv.role.replace(/_/g, ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Invite a new member</p>
            <InviteUserForm tenantId={tenantId} />
          </div>
        </div>
      </div>

      {/* Client-wide guardrails (Layer 3) */}
      {(() => {
        const DEFAULT_G: LayeredGuardrailsConfig = {
          blocked_topics: [], blocked_keywords: [], max_response_length: 2000,
          kb_only_mode: false, no_personal_data: false, no_external_links: false,
          on_blocked_topic: 'escalate',
        };
        const initial = (tenantGuardrailsRow?.guardrails_json as LayeredGuardrailsConfig) ?? DEFAULT_G;
        const saveAction = saveTenantGuardrailsByIdAction.bind(null, tenantId);
        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
              <ShieldAlert size={15} className="text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-800">Client-Wide Guardrails</h3>
              <span className="ml-auto text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium border border-indigo-100">
                Applies to all bots
              </span>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs text-slate-400 mb-5">
                These rules apply to every bot this client uses. They stack on top of global and bot-type guardrails.
              </p>
              <TenantGuardrailsForm initial={initial} action={saveAction} accentColor="indigo" />
            </div>
          </div>
        );
      })()}

      {/* Client AI Models */}
      {(() => {
        type RawLlmRow = { id: string; product_slug: string | null; provider: string; api_key: string; model: string; base_url: string | null; validation_status: 'pending' | 'valid' | 'invalid'; validation_error: string | null; validated_at: string | null; credit_info: { usage: number | null; limit: number | null; is_free_tier: boolean } | null; created_at: string };

        function maskLlm(row: RawLlmRow): LlmConfigCardProps['initial'] {
          return { id: row.id, provider: row.provider, api_key_masked: '••••' + row.api_key.slice(-4), model: row.model, base_url: row.base_url, validation_status: row.validation_status, validation_error: row.validation_error, validated_at: row.validated_at, credit_info: row.credit_info, created_at: row.created_at };
        }

        const llmMap: Record<string, RawLlmRow | null> = { __generic__: null };
        for (const r of (llmConfigRows ?? []) as RawLlmRow[]) llmMap[r.product_slug ?? '__generic__'] = r;

        const BOT_META: Record<string, { name: string; badge: string }> = {
          support_bot:   { name: 'Support Bot',   badge: 'bg-sky-100 text-sky-700 border-sky-200'          },
          sales_bot:     { name: 'Sales Bot',     badge: 'bg-violet-100 text-violet-700 border-violet-200' },
          lifecycle_bot: { name: 'Lifecycle Bot', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
        };

        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
              <Cpu size={15} className="text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-800">AI Models</h3>
              <span className="ml-auto text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium border border-indigo-100">
                Overrides platform defaults
              </span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-slate-400">
                Configure a dedicated API key and model for this client. These override platform-level defaults and allow separate billing or rate limits per client.
              </p>
              <LlmConfigCard label="Client Default" description="Applies to all this client's bots when no per-bot key is set." tenantId={tenantId} productSlug={null} initial={llmMap['__generic__'] ? maskLlm(llmMap['__generic__']!) : null} accent="indigo" />
              {tpRows.filter(p => p.active).map(p => {
                const meta = BOT_META[p.product_type] ?? { name: p.product_type, badge: 'bg-gray-100 text-gray-600 border-gray-200' };
                return (
                  <LlmConfigCard key={p.product_type} label={meta.name} description={`Override for this client's ${meta.name.toLowerCase()} only.`} tenantId={tenantId} productSlug={p.product_type} initial={llmMap[p.product_type] ? maskLlm(llmMap[p.product_type]!) : null} accent="indigo" />
                );
              })}
            </div>
          </div>
        );
      })()}

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
