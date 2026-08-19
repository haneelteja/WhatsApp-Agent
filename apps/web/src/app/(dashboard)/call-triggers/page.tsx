import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Zap, Info, RefreshCw, MessageSquare, Phone, Target } from 'lucide-react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { CallTriggersCard }  from '@/components/dashboard/CallTriggersCard';
import { CollapsibleCard }   from '@/components/CollapsibleCard';
import { FollowUpForm }      from '@/components/dashboard/FollowUpForm';
import { SalesFollowUpForm } from '@/components/dashboard/SalesFollowUpForm';
import type { BotVoiceConfig, SalesConfig } from '@alphabot/shared';
import type { FollowUpScope } from '@/app/actions/follow-up';

// ── Types ──────────────────────────────────────────────────────────────────────

type ContactRow    = { id: string; phone: string; name: string | null };
type FollowUpConfig = {
  enabled: boolean; idle_days: number; message_template: string;
  max_follow_ups: number; scope: FollowUpScope; contact_ids: string[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const BOT_META: Record<string, { name: string; color: string; bg: string; border: string; badge: string }> = {
  support_bot:   { name: 'Support Bot',   color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200',    badge: 'bg-sky-100 text-sky-700 border-sky-200'          },
  sales_bot:     { name: 'Sales Bot',     color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700 border-violet-200'  },
  lifecycle_bot: { name: 'Lifecycle Bot', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700 border-orange-200'  },
};

const TABS = [
  { key: 'follow-ups',      label: 'Message Follow-ups', icon: MessageSquare },
  { key: 'lead-follow-ups', label: 'Lead Follow-ups',    icon: Target        },
  { key: 'voice',           label: 'Voice Triggers',     icon: Phone         },
] as const;

type TabKey = typeof TABS[number]['key'];

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function TriggersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const rawParams  = await searchParams;
  const rawTab     = rawParams.tab ?? 'follow-ups';
  const activeTab: TabKey = TABS.some(t => t.key === rawTab)
    ? (rawTab as TabKey)
    : 'follow-ups';

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  if (!tenantUser) redirect('/dashboard');
  const tenantId = tenantUser.tenant_id;

  // Single parallel fetch for all data regardless of tab
  const [{ data: products }, { data: fuConfigs }, { data: convRows }, { data: botCfgs }] = await Promise.all([
    admin.from('tenant_products').select('product_type').eq('tenant_id', tenantId).eq('active', true),
    admin.from('follow_up_configs')
      .select('product_slug, enabled, idle_days, message_template, max_follow_ups, scope, contact_ids')
      .eq('tenant_id', tenantId),
    admin.from('conversations')
      .select('product_type, contact_id, contacts(id, phone, name)')
      .eq('tenant_id', tenantId),
    admin.from('bot_configs')
      .select('product_slug, voice_config, sales_config')
      .eq('tenant_id', tenantId),
  ]);

  const activeSlugs = (products ?? []).map(p => (p as { product_type: string }).product_type);

  const fuConfigMap = new Map<string, FollowUpConfig>(
    (fuConfigs ?? []).map(c => [(c as { product_slug: string }).product_slug, c as FollowUpConfig]),
  );

  const contactsByProduct = new Map<string, ContactRow[]>();
  for (const row of convRows ?? []) {
    const rawContact = (row as { contacts: ContactRow | ContactRow[] | null }).contacts;
    const contact    = Array.isArray(rawContact) ? rawContact[0] : rawContact;
    if (!contact) continue;
    const slug     = (row as { product_type: string }).product_type;
    const existing = contactsByProduct.get(slug) ?? [];
    if (!existing.some(c => c.id === contact.id)) existing.push(contact);
    contactsByProduct.set(slug, existing);
  }

  const voiceCfgMap = new Map<string, Partial<BotVoiceConfig>>(
    (botCfgs ?? []).map(r => [
      (r as { product_slug: string }).product_slug,
      ((r as { voice_config: Partial<BotVoiceConfig> | null }).voice_config ?? {}),
    ]),
  );

  const salesBotRow  = (botCfgs ?? []).find(r => (r as { product_slug: string }).product_slug === 'sales_bot');
  const salesConfig  = ((salesBotRow as { sales_config?: Partial<SalesConfig> } | undefined)?.sales_config ?? null);

  // Status indicators for tab badges
  const anyFollowUpEnabled  = [...fuConfigMap.values()].some(c => c.enabled);
  const leadFollowUpEnabled = !!salesConfig?.lead_follow_up_enabled;
  const anyVoiceTriggerOn   = activeSlugs.some(slug => {
    const vc = voiceCfgMap.get(slug);
    return vc?.trigger_on_call_request || vc?.trigger_on_negative_sentiment || vc?.trigger_on_no_reply;
  });

  const noActiveBots = activeSlugs.length === 0;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
          <Zap size={18} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Triggers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure when and how the bot takes automated actions — follow-up messages, sales lead sequences, and voice call triggers.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {TABS.map(t => {
          const isActive = activeTab === t.key;
          const dotOn =
            t.key === 'follow-ups'      ? anyFollowUpEnabled :
            t.key === 'lead-follow-ups' ? leadFollowUpEnabled :
            anyVoiceTriggerOn;
          return (
            <Link
              key={t.key}
              href={`/call-triggers?tab=${t.key}`}
              className={`flex-1 flex items-center justify-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-lg transition-all duration-150 ${
                isActive
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
              }`}
            >
              <t.icon size={13} />
              <span className="hidden sm:inline">{t.label}</span>
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotOn ? 'bg-emerald-500' : 'bg-slate-300'}`}
                title={dotOn ? 'Active' : 'Off'}
              />
            </Link>
          );
        })}
      </div>

      {/* ── Tab: Message Follow-ups ─────────────────────────────────────────── */}
      {activeTab === 'follow-ups' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Automatically re-message customers who go quiet on a conversation. Configure per bot.
          </p>

          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Info size={13} className="text-emerald-600 shrink-0" />
              <p className="text-xs font-semibold text-emerald-800">How it works</p>
            </div>
            <ul className="list-disc ml-4 space-y-1 text-xs text-emerald-700">
              <li>When a customer goes silent for the configured idle days, the bot sends your follow-up message</li>
              <li>Max follow-ups limits how many times a single conversation is followed up before the bot stops</li>
              <li>Only <strong>open</strong> conversations are eligible — resolved or escalated ones are skipped</li>
            </ul>
          </div>

          {noActiveBots ? (
            <EmptyBots />
          ) : (
            <div className="space-y-3">
              {activeSlugs.map(slug => {
                const meta = BOT_META[slug];
                if (!meta) return null;
                const cfg        = fuConfigMap.get(slug);
                const isEnabled  = cfg?.enabled ?? false;
                const idleDays   = cfg?.idle_days ?? 3;
                const template   = cfg?.message_template ?? '';
                const maxSends   = cfg?.max_follow_ups ?? 1;
                const scope      = (cfg?.scope ?? 'all') as FollowUpScope;
                const contactIds = cfg?.contact_ids ?? [];
                const contacts   = contactsByProduct.get(slug) ?? [];
                const scopeLabel = scope === 'include' ? `${contactIds.length} contacts` : scope === 'exclude' ? `All except ${contactIds.length}` : 'All';

                const header = (
                  <div className="flex items-center gap-3 w-full min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg} border ${meta.border}`}>
                      <RefreshCw size={13} className={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${meta.color}`}>{meta.name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isEnabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                          {isEnabled ? `On · ${idleDays}d · ${scopeLabel}` : 'Off'}
                        </span>
                      </div>
                    </div>
                  </div>
                );

                return (
                  <CollapsibleCard key={slug} header={header} borderClass={meta.border} defaultOpen={false}>
                    <FollowUpForm
                      productSlug={slug} productName={meta.name} contacts={contacts}
                      initialEnabled={isEnabled} initialIdleDays={idleDays}
                      initialTemplate={template} initialMaxSends={maxSends}
                      initialScope={scope} initialContactIds={contactIds}
                    />
                  </CollapsibleCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Sales Lead Follow-ups ──────────────────────────────────────── */}
      {activeTab === 'lead-follow-ups' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Send timed follow-up sequences exclusively to contacts flagged as sales leads — separate from general follow-ups.
          </p>

          <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-violet-50">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-violet-50 border border-violet-200">
                <Target size={13} className="text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-violet-600">Sales Bot — Lead Follow-ups</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${salesConfig?.lead_follow_up_enabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                    {salesConfig?.lead_follow_up_enabled
                      ? `On · ${salesConfig.lead_follow_up_delay_hours ?? 4}h delay`
                      : 'Off'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Auto-messages qualified leads who stop responding — up to 3 follow-ups</p>
              </div>
            </div>
            <div className="p-5">
              <SalesFollowUpForm initial={salesConfig} />
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Voice Call Triggers ────────────────────────────────────────── */}
      {activeTab === 'voice' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Configure when the bot automatically places an outbound voice call from an ongoing WhatsApp conversation.
          </p>

          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
            <Info size={15} className="mt-0.5 shrink-0 text-blue-500" />
            <div>
              <p className="font-medium">How voice triggers work</p>
              <p className="text-blue-700 mt-0.5">
                When a trigger fires, the bot places an outbound voice call to the customer&apos;s WhatsApp number.
                Voice must be enabled in{' '}
                <a href="/settings?tab=voice" className="underline text-blue-600 hover:text-blue-700">Settings → Voice</a>.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">
            <Phone size={15} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <p className="font-medium text-slate-700">Escalation dispatch</p>
              <p className="mt-0.5 text-slate-500">
                Auto-call on escalation is configured per-bot in{' '}
                <a href="/settings?tab=voice" className="underline text-emerald-600 hover:text-emerald-700">
                  Settings → Voice
                </a>{' '}
                under &ldquo;Auto-dispatch on escalation.&rdquo;
              </p>
            </div>
          </div>

          {noActiveBots ? (
            <EmptyBots />
          ) : (
            <div className="space-y-4">
              {activeSlugs.map(slug => {
                const meta = BOT_META[slug] ?? { name: slug, badge: 'bg-gray-100 text-gray-600 border-gray-200' };
                return (
                  <CallTriggersCard
                    key={slug}
                    productSlug={slug}
                    botName={meta.name}
                    badgeColor={meta.badge}
                    voiceCfg={voiceCfgMap.get(slug) ?? {}}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function EmptyBots() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-12 text-center">
      <Zap size={24} className="text-gray-300 mb-3" />
      <p className="text-sm font-semibold text-gray-500">No active bots</p>
      <p className="text-xs text-gray-400 mt-1">
        Activate a bot in{' '}
        <a href="/settings?tab=workspace" className="underline text-emerald-600">Settings → Workspace</a>.
      </p>
    </div>
  );
}
