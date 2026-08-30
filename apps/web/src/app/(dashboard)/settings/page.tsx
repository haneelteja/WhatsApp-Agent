import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Building2, Phone, Bot, Link2, Bell, CreditCard, ChevronRight,
  Users, Mail, Clock, Trash2, Info, Cpu, MessageSquare, ShieldOff,
} from 'lucide-react';
import { WhatsAppSetupSection }  from '@/components/dashboard/WhatsAppSetupSection';
import { NotificationSettings }  from '@/components/dashboard/NotificationSettings';
import { BotProductsSection }    from '@/components/dashboard/BotProductsSection';
import { WhatsAppNumbersManager} from '@/components/dashboard/WhatsAppNumbersManager';
import { TeamInviteForm }        from '@/components/dashboard/TeamInviteForm';
import { removeTeamMemberAction } from '@/app/actions/tenant-team';
import { LlmConfigCard }         from '@/components/LlmConfigCard';
import type { LlmConfigCardProps } from '@/components/LlmConfigCard';
import { ClientVoiceConfigCard, type BotVoiceConfigRow, type ExotelConfigRow } from '@/components/dashboard/ClientVoiceConfigCard';
import { VoiceWorkingHoursCard, type WorkingHoursInitial } from '@/components/dashboard/VoiceWorkingHoursCard';
import { VoiceCallSummaryCard, type CallSummaryInitial } from '@/components/dashboard/VoiceCallSummaryCard';
import { InternalNumbersManager } from '@/components/dashboard/InternalNumbersManager';
import { listInternalNumbers } from '@/app/actions/internal-numbers';

// ─── Types ────────────────────────────────────────────────────────────────────

type RawLlmConfig = {
  id: string;
  product_slug: string | null;
  provider: string;
  api_key: string;
  model: string;
  base_url: string | null;
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_error: string | null;
  validated_at: string | null;
  credit_info: { usage: number | null; limit: number | null; is_free_tier: boolean } | null;
  created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin:          { label: 'Admin',      color: 'bg-violet-50 text-violet-700' },
  client_manager: { label: 'Admin',      color: 'bg-violet-50 text-violet-700' },
  supervisor:     { label: 'Supervisor', color: 'bg-sky-50 text-sky-700' },
  client_admin:   { label: 'Supervisor', color: 'bg-sky-50 text-sky-700' },
  agent:          { label: 'Agent',      color: 'bg-slate-100 text-slate-600' },
};

const BOT_META_LLM: Record<string, { name: string; badge: string }> = {
  support_bot:   { name: 'Support Bot',   badge: 'bg-sky-100 text-sky-700 border-sky-200'          },
  sales_bot:     { name: 'Sales Bot',     badge: 'bg-violet-100 text-violet-700 border-violet-200'  },
  lifecycle_bot: { name: 'Lifecycle Bot', badge: 'bg-orange-100 text-orange-700 border-orange-200'  },
};

function maskLlmConfig(row: RawLlmConfig): LlmConfigCardProps['initial'] {
  return {
    id:                row.id,
    provider:          row.provider,
    api_key_masked:    '••••' + row.api_key.slice(-4),
    model:             row.model,
    base_url:          row.base_url,
    validation_status: row.validation_status,
    validation_error:  row.validation_error,
    validated_at:      row.validated_at,
    credit_info:       row.credit_info,
    created_at:        row.created_at,
  };
}

const TABS = [
  { key: 'workspace',    label: 'Workspace'     },
  { key: 'team',         label: 'Team'          },
  { key: 'models',       label: 'AI Models'     },
  { key: 'voice',        label: 'Voice'         },
  { key: 'notifications',label: 'Notifications' },
] as const;

type TabKey = typeof TABS[number]['key'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const rawTab = searchParams.tab ?? 'workspace';
  const activeTab: TabKey = TABS.some(t => t.key === rawTab)
    ? (rawTab as TabKey)
    : 'workspace';

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: callerTU } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single();

  if (!callerTU) redirect('/dashboard');
  const tenantId = callerTU.tenant_id;
  const isAdmin  = ['admin', 'client_manager', 'supervisor'].includes(callerTU.role);

  // ── Workspace data ──────────────────────────────────────────────────────────
  let tenant: Record<string, unknown> | null = null;
  let numbers: Record<string, unknown>[] | null = null;
  let products: Record<string, unknown>[] | null = null;

  if (activeTab === 'workspace') {
    const apiBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://your-api.onrender.com';
    const [tenantRes, numbersRes, productsRes, { numbers: internalNumbers }] = await Promise.all([
      admin.from('tenants').select('*').eq('id', tenantId).single(),
      admin.from('whatsapp_numbers').select('*').eq('tenant_id', tenantId),
      admin.from('tenant_products').select('*').eq('tenant_id', tenantId),
      listInternalNumbers(),
    ]);
    tenant   = tenantRes.data as Record<string, unknown> | null;
    numbers  = (numbersRes.data ?? []) as Record<string, unknown>[];
    products = (productsRes.data ?? []) as Record<string, unknown>[];

    const activeBots = products.filter(p => p['active']);
    const botWebhooks = activeBots.map(p => {
      const wn     = numbers!.find(n => n['product_slug'] === p['product_type']);
      const config = ((wn?.['config_json'] ?? {}) as Record<string, string>);
      return {
        productType:  p['product_type'] as string,
        webhookUrl:   tenant?.['id'] ? `${apiBase}/api/webhook/${tenant['id']}/${p['product_type']}` : '',
        verifyToken:  config['verify_token'] ?? null,
        phoneNumber:  (wn?.['phone_number'] as string | undefined) ?? null,
        configured:   !!wn,
      };
    });

    return (
      <SettingsShell activeTab={activeTab}>
        <div className="space-y-5">
          <Section icon={<Building2 size={16} />} title="Workspace" hint="Read-only account details. Share your Tenant ID with support when reporting issues.">
            <div className="divide-y divide-green-50">
              <InfoRow label="Name"      value={(tenant?.['name'] as string) ?? '—'} />
              <InfoRow label="Provider"  value={(tenant?.['provider'] as string) ?? '—'} capitalize />
              <InfoRow label="Tenant ID" value={(tenant?.['id'] as string) ?? '—'} mono />
              <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="text-sm text-gray-400 shrink-0">Plan</span>
                <PlanBadge plan={(tenant?.['plan'] as string) ?? 'starter'} />
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="text-sm text-gray-400 shrink-0">Status</span>
                <StatusBadge status={(tenant?.['status'] as string) ?? 'active'} />
              </div>
              <Link href="/billing" className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-green-50 transition-colors group">
                <div className="flex items-center gap-2">
                  <CreditCard size={14} className="text-emerald-500" />
                  <span className="text-sm text-gray-700 font-medium">Billing &amp; Usage</span>
                </div>
                <ChevronRight size={14} className="text-gray-400 group-hover:text-emerald-500 transition-colors" />
              </Link>
            </div>
          </Section>

          <Section icon={<Phone size={16} />} title="WhatsApp Numbers" hint="Connect your Meta phone numbers to bots. Each number routes incoming messages to the assigned bot. Add the Phone Number ID from your Meta App Dashboard.">
            <WhatsAppNumbersManager
              numbers={numbers!.map(n => ({
                id:              n['id'] as string,
                phone_number:    n['phone_number'] as string,
                provider:        n['provider'] as string,
                label:           (n['label'] ?? null) as string | null,
                product_slug:    (n['product_slug'] ?? null) as string | null,
                phone_number_id: ((n['config_json'] as Record<string, string>)?.['phone_number_id'] ?? null),
              }))}
              activeBots={activeBots.map(p => p['product_type'] as 'support_bot' | 'sales_bot' | 'lifecycle_bot')}
              webhookBase={`${apiBase}/api/webhook/${tenant?.['id'] ?? ''}`}
            />
          </Section>

          <Section icon={<ShieldOff size={16} />} title="Internal Team Numbers" hint="Messages from these numbers are silently ignored — no bot reply, no lead created. Add your team members' WhatsApp numbers here so internal tests don't appear as leads.">
            <InternalNumbersManager initialNumbers={internalNumbers} />
          </Section>

          <Section icon={<Bot size={16} />} title="Bot Products" hint="Activate or disable bots included in your plan. Only active bots respond to WhatsApp messages. Deactivating a bot does not delete its conversation history.">
            <BotProductsSection
              tenantId={(tenant?.['id'] as string) ?? ''}
              apiBase={apiBase}
              tenantProducts={products as { product_type: string; tier: string; active: boolean }[]}
              numbers={numbers!.map(n => ({
                id:           n['id'] as string,
                phone_number: n['phone_number'] as string,
                provider:     n['provider'] as string,
                label:        (n['label'] ?? null) as string | null,
                product_slug: (n['product_slug'] ?? null) as string | null,
              }))}
            />
          </Section>


          {activeBots.length > 0 && (
            <Section icon={<Link2 size={16} />} title="Meta Cloud API & Webhook Setup" hint="Paste the Webhook URL and Verify Token into your Meta App Dashboard under WhatsApp → Configuration to activate message delivery.">
              <div className="px-5 py-4">
                <WhatsAppSetupSection bots={botWebhooks} />
              </div>
            </Section>
          )}
        </div>
      </SettingsShell>
    );
  }

  // ── Team data ───────────────────────────────────────────────────────────────
  if (activeTab === 'team') {
    const { data: tenantUsers } = await admin
      .from('tenant_users')
      .select('user_id, role, created_at')
      .eq('tenant_id', tenantId);

    const members = await Promise.all(
      (tenantUsers ?? []).map(async (tu) => {
        const { data: { user: authUser } } = await admin.auth.admin.getUserById(tu.user_id);
        return {
          userId:   tu.user_id,
          role:     tu.role,
          joinedAt: tu.created_at,
          email:    authUser?.email ?? '—',
          name:     (authUser?.user_metadata?.['full_name'] as string | undefined) ?? null,
          isSelf:   tu.user_id === user.id,
        };
      })
    );

    const { data: pendingInvites } = await admin
      .from('client_invites')
      .select('id, email, role, created_at, expires_at')
      .eq('tenant_id', tenantId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });

    return (
      <SettingsShell activeTab={activeTab}>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">Manage your team members and invite new agents.</p>
            <span className="text-xs font-semibold text-gray-500 bg-white border border-green-100 px-3 py-1.5 rounded-full shadow-sm shrink-0">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Role guide */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { role: 'Admin',      desc: 'Full access. Can invite, remove members, and change all settings.',      color: 'bg-violet-50 border-violet-100 text-violet-700' },
              { role: 'Supervisor', desc: 'Manages conversations and settings. Cannot invite or remove members.',   color: 'bg-sky-50 border-sky-100 text-sky-700' },
              { role: 'Agent',      desc: 'Handles assigned conversations only. No access to settings.',            color: 'bg-slate-50 border-slate-100 text-slate-600' },
            ].map(r => (
              <div key={r.role} className={`rounded-xl border p-3 ${r.color}`}>
                <p className="text-[11px] font-bold">{r.role}</p>
                <p className="text-[10px] mt-1 leading-relaxed opacity-80">{r.desc}</p>
              </div>
            ))}
          </div>

          {isAdmin
            ? <TeamInviteForm />
            : (
              <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500">Only Admins can invite or remove team members. Contact your workspace Admin to make changes.</p>
              </div>
            )
          }

          <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Users size={14} />
                Active members
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {members.map((m) => {
                const roleMeta = ROLE_LABELS[m.role] ?? { label: m.role, color: 'bg-slate-100 text-slate-600' };
                return (
                  <div key={m.userId} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                      {(m.name ?? m.email)[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      {m.name && <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>}
                      <p className="text-xs text-slate-500 truncate">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${roleMeta.color}`}>
                        {roleMeta.label}
                      </span>
                      {m.isSelf && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">You</span>
                      )}
                      {isAdmin && !m.isSelf && (
                        <form action={removeTeamMemberAction.bind(null, m.userId) as unknown as (formData: FormData) => Promise<void>}>
                          <button
                            type="submit"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="Remove member"
                          >
                            <Trash2 size={13} />
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {(pendingInvites?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Clock size={14} />
                  Pending invites
                </h3>
              </div>
              <div className="divide-y divide-slate-50">
                {(pendingInvites ?? []).map((inv) => {
                  const expired   = new Date(inv.expires_at) < new Date();
                  const roleMeta  = ROLE_LABELS[inv.role] ?? { label: inv.role, color: 'bg-slate-100 text-slate-600' };
                  return (
                    <div key={inv.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <Mail size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{inv.email}</p>
                        <p className={`text-xs mt-0.5 ${expired ? 'text-red-400' : 'text-slate-400'}`}>
                          {expired ? 'Expired' : `Expires ${new Date(inv.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                        </p>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${roleMeta.color}`}>
                        {roleMeta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SettingsShell>
    );
  }

  // ── AI Models data ──────────────────────────────────────────────────────────
  if (activeTab === 'models') {
    const [{ data: llmRows }, { data: llmProducts }] = await Promise.all([
      admin.from('llm_configs').select('id, product_slug, provider, api_key, model, base_url, validation_status, validation_error, validated_at, credit_info, created_at').eq('tenant_id', tenantId),
      admin.from('tenant_products').select('product_type').eq('tenant_id', tenantId).eq('active', true),
    ]);

    const configMap: Record<string, RawLlmConfig | null> = { __generic__: null };
    for (const row of (llmRows ?? []) as RawLlmConfig[]) {
      configMap[row.product_slug ?? '__generic__'] = row;
    }
    const activeSlugs = (llmProducts ?? []).map((p: { product_type: string }) => p.product_type);

    return (
      <SettingsShell activeTab={activeTab}>
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            Bring your own LLM API key for cost control and higher rate limits. Leave blank to use the platform default — your bots work out of the box without any configuration here.
          </p>

          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Info size={13} className="text-emerald-600" />
              <p className="text-xs font-semibold text-emerald-800">How this works</p>
            </div>
            <div className="flex items-center gap-1 flex-wrap text-[11px] text-emerald-600">
              {['Per-Bot (below)', 'Account Default (below)', 'Platform Bot-type', 'Platform Default'].map((level, i) => (
                <span key={level} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={10} className="text-emerald-300" />}
                  <span className={i < 2 ? 'font-semibold text-emerald-700' : 'text-emerald-400'}>{level}</span>
                </span>
              ))}
              <span className="ml-1 text-emerald-400">→ system default</span>
            </div>
            <p className="text-[11px] text-emerald-600">
              All fields are <span className="font-semibold">optional</span> — your bots work without any configuration here (using the platform default).
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-green-50">
              <Cpu size={15} className="text-emerald-500" />
              <h3 className="text-sm font-semibold text-gray-800">Account Default</h3>
              <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                All your bots
              </span>
            </div>
            <div className="p-4">
              <LlmConfigCard
                label="Account Default"
                description="Used when no per-bot configuration is set. Applies across all your bots."
                tenantId={tenantId}
                productSlug={null}
                initial={configMap['__generic__'] ? maskLlmConfig(configMap['__generic__']!) : null}
                accent="emerald"
              />
            </div>
          </div>

          {activeSlugs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={14} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">Per-Bot Override</h3>
                <span className="ml-auto text-[11px] text-gray-400">Overrides account default for that bot only</span>
              </div>
              <div className="space-y-3">
                {activeSlugs.map((slug: string) => {
                  const meta = BOT_META_LLM[slug] ?? { name: slug, badge: 'bg-gray-100 text-gray-600 border-gray-200' };
                  return (
                    <div key={slug} className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-green-50">
                        <h4 className="text-sm font-semibold text-gray-800">{meta.name}</h4>
                        <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.badge}`}>
                          {slug.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="p-4">
                        <LlmConfigCard
                          label={meta.name}
                          description={`Overrides your account default specifically for the ${meta.name.toLowerCase()}.`}
                          tenantId={tenantId}
                          productSlug={slug}
                          initial={configMap[slug] ? maskLlmConfig(configMap[slug]!) : null}
                          accent="emerald"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSlugs.length === 0 && (
            <p className="text-center py-8 text-sm text-gray-400">
              No active bots found. Activate bots from the Workspace tab to configure per-bot models.
            </p>
          )}
        </div>
      </SettingsShell>
    );
  }

  // ── Voice data ──────────────────────────────────────────────────────────────
  if (activeTab === 'voice') {
    const [{ data: voiceProducts }, { data: botCfgs }, { data: tvc }] = await Promise.all([
      admin.from('tenant_products').select('product_type').eq('tenant_id', tenantId).eq('active', true),
      admin.from('bot_configs').select('product_slug, voice_config').eq('tenant_id', tenantId),
      admin.from('tenant_voice_configs')
        .select('from_number, exotel_api_key, exotel_account_sid, timezone, working_hours_enabled, working_hours_json, call_summary_enabled, call_summary_wa_numbers')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    ]);

    const BOT_NAMES: Record<string, string> = {
      support_bot:   'Support Bot',
      sales_bot:     'Sales Bot',
      lifecycle_bot: 'Lifecycle Bot',
    };

    const voiceBots: BotVoiceConfigRow[] = (voiceProducts ?? []).map(p => ({
      product_slug:  p.product_type,
      product_name:  BOT_NAMES[p.product_type] ?? p.product_type,
      voice_config:  ((botCfgs ?? []).find(bc => bc.product_slug === p.product_type)?.voice_config ?? null) as BotVoiceConfigRow['voice_config'],
    }));

    const tvcRow = tvc as {
      from_number:              string;
      exotel_api_key:           string | null;
      exotel_account_sid:       string | null;
      timezone:                 string | null;
      working_hours_enabled:    boolean | null;
      working_hours_json:       WorkingHoursInitial['working_hours_json'] | null;
      call_summary_enabled:     boolean | null;
      call_summary_wa_numbers:  string[] | null;
    } | null;

    const exotelInitial: ExotelConfigRow | null = tvcRow
      ? {
          from_number:        tvcRow.from_number,
          has_exotel_creds:   !!tvcRow.exotel_api_key,
          exotel_account_sid: tvcRow.exotel_account_sid,
        }
      : null;

    const workingHoursInitial: WorkingHoursInitial | null = tvcRow?.working_hours_json
      ? {
          timezone:              tvcRow.timezone ?? 'Asia/Kolkata',
          working_hours_enabled: tvcRow.working_hours_enabled ?? false,
          working_hours_json:    tvcRow.working_hours_json,
        }
      : null;

    const callSummaryInitial: CallSummaryInitial | null = tvcRow
      ? {
          call_summary_enabled:    tvcRow.call_summary_enabled    ?? false,
          call_summary_wa_numbers: tvcRow.call_summary_wa_numbers ?? [],
        }
      : null;

    return (
      <SettingsShell activeTab={activeTab}>
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <Phone size={15} className="text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">Voice Calling</h3>
            </div>
            <p className="text-xs text-gray-400 mb-6">
              Enable voice calls for each bot. When enabled, your bot can make AI-powered outbound calls —
              on escalation, on demand, or via campaign. Platform voice (Twilio) is managed for you.
            </p>
            <ClientVoiceConfigCard bots={voiceBots} exotel={exotelInitial} />
          </div>

          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={15} className="text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">Working Hours</h3>
            </div>
            <p className="text-xs text-gray-400 mb-6">
              Set the days and times when outbound voice calls are allowed. Calls triggered outside
              these hours — manual, campaign, or escalation — will be blocked automatically.
            </p>
            <VoiceWorkingHoursCard initial={workingHoursInitial} />
          </div>

          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare size={15} className="text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">Call Summary Notifications</h3>
            </div>
            <p className="text-xs text-gray-400 mb-6">
              After each completed call, send a WhatsApp summary to your internal team — including
              call outcome, customer intent, sentiment, and recommended next steps.
            </p>
            <VoiceCallSummaryCard initial={callSummaryInitial} />
          </div>
        </div>
      </SettingsShell>
    );
  }

  // ── Notifications data ──────────────────────────────────────────────────────
  const { data: notifSettings } = await admin
    .from('tenant_notification_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  return (
    <SettingsShell activeTab={activeTab}>
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          Set up who receives an alert the moment a customer conversation is escalated by the bot.
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-2">
            <Bell size={13} className="text-amber-600 shrink-0" />
            <p className="text-xs font-semibold text-amber-800">When does escalation happen?</p>
          </div>
          <p className="text-xs text-amber-700">
            The bot escalates when a customer explicitly requests a human, or when it cannot confidently answer after a set number of retries. You can also configure keywords that trigger escalation in{' '}
            <Link href="/guardrails" className="font-semibold underline">Guardrails</Link>.
          </p>
        </div>

        <Section icon={<Bell size={16} />} title="Escalation Notifications" hint="Add email addresses or WhatsApp numbers (international format, e.g. +919876543210) to alert when a conversation is escalated. The customer message is sent to the end user immediately on escalation.">
          <NotificationSettings
            initialEmails={(notifSettings?.escalation_emails as string[] | null) ?? []}
            initialWaNumbers={(notifSettings?.escalation_wa_numbers as string[] | null) ?? []}
            initialCustomerMessage={notifSettings?.escalation_customer_message ?? 'Your query has been escalated to our team. A team member will get back to you shortly.'}
            initialFromEmail={(notifSettings as { from_email?: string | null } | null)?.from_email ?? ''}
            initialResendConfigured={!!(notifSettings as { resend_api_key?: string | null } | null)?.resend_api_key}
            initialResendKeyMasked={(notifSettings as { resend_api_key?: string | null } | null)?.resend_api_key
              ? '••••' + ((notifSettings as { resend_api_key: string }).resend_api_key).slice(-4)
              : ''}
          />
        </Section>
      </div>
    </SettingsShell>
  );
}

// ─── Shell (tabs + layout wrapper) ────────────────────────────────────────────

function SettingsShell({
  activeTab,
  children,
}: {
  activeTab: TabKey;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Workspace, team, and bot configuration</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => {
          const isActive = activeTab === t.key;
          return (
            <Link
              key={t.key}
              href={`/settings?tab=${t.key}`}
              className={`flex-1 text-center text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}

// ─── Shared UI helpers ─────────────────────────────────────────────────────────

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
      <div className="flex items-start gap-2.5 px-5 py-4 border-b border-green-50">
        <span className="text-emerald-600 mt-0.5 shrink-0">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
          {hint && <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono = false, capitalize = false }: { label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className={`text-right truncate max-w-[60%] ${mono ? 'font-mono text-xs text-gray-600 bg-green-50 px-2 py-0.5 rounded-md' : 'text-sm text-gray-700'} ${capitalize ? 'capitalize' : ''}`}>
        {value}
      </span>
    </div>
  );
}

const PLAN_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  starter: { label: 'Starter', bg: 'bg-slate-100',   text: 'text-slate-700'   },
  growth:  { label: 'Growth',  bg: 'bg-violet-100',  text: 'text-violet-700'  },
  scale:   { label: 'Scale',   bg: 'bg-emerald-100', text: 'text-emerald-700' },
};

function PlanBadge({ plan }: { plan: string }) {
  const b = PLAN_BADGE[plan] ?? PLAN_BADGE['starter'];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${b.bg} ${b.text}`}>
      {b.label}
    </span>
  );
}

const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  active:    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  trial:     { bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-500'     },
  suspended: { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'     },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE['active'];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
