import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  MessageSquare, AlertCircle, CheckCircle2, Bot, ArrowRight,
  BookOpen, ShieldAlert, ShieldOff, Lock, ExternalLink,
  User, Phone, ChevronRight, Sparkles,
} from 'lucide-react';

// ─── Display maps ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  open:       { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  escalated:  { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 ring-red-100' },
  resolved:   { dot: 'bg-gray-300',    badge: 'bg-gray-100 text-gray-500 ring-gray-200' },
  bot_paused: { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 ring-amber-100' },
};

const PRODUCT_LABELS: Record<string, { label: string; color: string }> = {
  support_bot:   { label: 'Support',   color: 'bg-sky-50 text-sky-600' },
  sales_bot:     { label: 'Sales',     color: 'bg-violet-50 text-violet-600' },
  lifecycle_bot: { label: 'Lifecycle', color: 'bg-orange-50 text-orange-600' },
};

// ─── Per-bot colour tokens ────────────────────────────────────────────────────

const BOT_META: Record<string, {
  name:      string;
  desc:      string;
  border:    string;
  headerBg:  string;
  dotColor:  string;
  accent:    string;
  accentBg:  string;
}> = {
  support_bot: {
    name:     'Support Bot',
    desc:     'Customer Q&A, issue resolution, escalation routing',
    border:   'border-sky-200',
    headerBg: 'bg-gradient-to-r from-sky-600 to-sky-500',
    dotColor: 'bg-sky-300',
    accent:   'text-sky-600',
    accentBg: 'bg-sky-50',
  },
  sales_bot: {
    name:     'Sales Bot',
    desc:     'Lead qualification, product info, warm agent handoff',
    border:   'border-violet-200',
    headerBg: 'bg-gradient-to-r from-violet-600 to-violet-500',
    dotColor: 'bg-violet-300',
    accent:   'text-violet-600',
    accentBg: 'bg-violet-50',
  },
  lifecycle_bot: {
    name:     'Lifecycle Bot',
    desc:     'Order tracking, invoicing, payment collection',
    border:   'border-orange-200',
    headerBg: 'bg-gradient-to-r from-orange-500 to-orange-400',
    dotColor: 'bg-orange-300',
    accent:   'text-orange-600',
    accentBg: 'bg-orange-50',
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentFilters = {
  no_personal_data?:             boolean;
  no_external_links?:            boolean;
  no_phone_numbers_in_response?: boolean;
};

type BotGuardrailsJson = {
  blocked_topics?:   string[];
  blocked_keywords?: string[];
  content_filters?:  ContentFilters;
  on_blocked_topic?: 'escalate' | 'ignore';
  tone?:             string;
};

type TenantGuardrailsJson = {
  blocked_topics?:   string[];
  blocked_keywords?: string[];
  no_personal_data?: boolean;
  no_external_links?: boolean;
};

type BotConfig = {
  product_slug:         string;
  escalation_triggers:  string[] | null;
  guardrails_json:      BotGuardrailsJson | null;
  confidence_threshold: number | null;
  kb_only_mode:         boolean | null;
};

type KbCollection = {
  id:          string;
  name:        string;
  description: string | null;
  entry_count: number;
  active:      boolean;
};

type CollectionRow = {
  product_slug: string;
  priority:     number;
  kb_collections: KbCollection | null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  const tid = tenantUser?.tenant_id ?? '';

  const [
    { count: openCount },
    { count: escalationCount },
    { count: resolvedCount },
    { count: totalCount },
    { data: recent },
    { data: activeProducts },
    { data: botConfigs },
    { data: collectionBots },
    { data: tenantGuardrailsRow },
  ] = await Promise.all([
    admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'open'),
    admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'escalated'),
    admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'resolved'),
    admin.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
    admin
      .from('conversations')
      .select('id, status, product_type, updated_at, contacts(name, phone)')
      .eq('tenant_id', tid)
      .order('updated_at', { ascending: false })
      .limit(8),
    admin.from('tenant_products')
      .select('product_type')
      .eq('tenant_id', tid)
      .eq('active', true),
    admin.from('bot_configs')
      .select('product_slug, escalation_triggers, guardrails_json, confidence_threshold, kb_only_mode')
      .eq('tenant_id', tid),
    admin.from('kb_collection_bots')
      .select('product_slug, priority, kb_collections(id, name, description, entry_count, active)')
      .eq('tenant_id', tid),
    admin.from('tenant_guardrails')
      .select('guardrails_json')
      .eq('tenant_id', tid)
      .maybeSingle(),
  ]);

  // ── Build per-bot data structures ─────────────────────────────────────────

  const configMap = new Map<string, BotConfig>();
  for (const cfg of (botConfigs ?? []) as BotConfig[]) {
    configMap.set(cfg.product_slug, cfg);
  }

  // KB is tenant-wide (shared across all bots) — collect unique active collections sorted by priority
  const seenCollectionIds = new Set<string>();
  const tenantCollections: KbCollection[] = [];
  const sortedRows = [...((collectionBots ?? []) as unknown as CollectionRow[])]
    .sort((a, b) => a.priority - b.priority);
  for (const row of sortedRows) {
    const col = row.kb_collections;
    if (!col || !col.active || seenCollectionIds.has(col.id)) continue;
    seenCollectionIds.add(col.id);
    tenantCollections.push(col);
  }

  const tenantG      = (tenantGuardrailsRow?.guardrails_json ?? {}) as TenantGuardrailsJson;
  const activeSlugs  = (activeProducts ?? []).map(p => p.product_type as string);

  const stats = [
    { label: 'Open',      value: openCount      ?? 0, sub: 'Bot handling',   icon: MessageSquare, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', valColor: 'text-emerald-700' },
    { label: 'Escalated', value: escalationCount ?? 0, sub: 'Need attention', icon: AlertCircle,   iconBg: 'bg-red-100',     iconColor: 'text-red-600',     valColor: 'text-red-700'     },
    { label: 'Resolved',  value: resolvedCount   ?? 0, sub: 'All time',       icon: CheckCircle2,  iconBg: 'bg-sky-100',     iconColor: 'text-sky-600',     valColor: 'text-sky-700'     },
    { label: 'Total',     value: totalCount      ?? 0, sub: 'Conversations',  icon: Bot,           iconBg: 'bg-violet-100',  iconColor: 'text-violet-600',  valColor: 'text-violet-700'  },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-0.5">Monitor your WhatsApp AI agents in real time</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${s.iconBg} flex items-center justify-center shrink-0`}>
              <s.icon size={16} className={s.iconColor} />
            </div>
            <div>
              <p className={`text-2xl font-bold tabular-nums leading-none ${s.valColor}`}>{s.value}</p>
              <p className="text-xs font-semibold text-gray-700 mt-0.5">{s.label}</p>
              <p className="text-[10px] text-gray-400">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Bot Capability Cards ─────────────────────────────────────────── */}
      {activeSlugs.length > 0 && (
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Bot Capabilities</h3>
            <p className="text-xs text-gray-400 mt-0.5">Real-time overview of what each bot knows, how it handles queries, and what it avoids</p>
          </div>

          <div className={`grid gap-5 ${
            activeSlugs.length === 1 ? 'grid-cols-1' :
            activeSlugs.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
            'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
          }`}>
            {activeSlugs.map((slug) => {
              const meta = BOT_META[slug];
              if (!meta) return null;

              const cfg          = configMap.get(slug);
              const collections  = tenantCollections;
              const totalEntries = collections.reduce((sum, c) => sum + c.entry_count, 0);

              const triggers       = cfg?.escalation_triggers ?? [];
              const threshold      = cfg?.confidence_threshold ?? 0.6;
              const kbOnly         = cfg?.kb_only_mode ?? false;
              const tone           = cfg?.guardrails_json?.tone ?? 'professional';
              const onBlockedTopic = cfg?.guardrails_json?.on_blocked_topic ?? 'escalate';

              // Merge tenant-level + bot-level guardrails (tenant applied first, bot overrides)
              const blockedTopics = [
                ...new Set([
                  ...(tenantG.blocked_topics   ?? []).filter(Boolean),
                  ...(cfg?.guardrails_json?.blocked_topics   ?? []).filter(Boolean),
                ]),
              ];
              const blockedKeywords = [
                ...new Set([
                  ...(tenantG.blocked_keywords ?? []).filter(Boolean),
                  ...(cfg?.guardrails_json?.blocked_keywords ?? []).filter(Boolean),
                ]),
              ];

              const cf              = cfg?.guardrails_json?.content_filters ?? {};
              const noPersonalData  = cf.no_personal_data             ?? tenantG.no_personal_data  ?? false;
              const noExternalLinks = cf.no_external_links            ?? tenantG.no_external_links ?? false;
              const noPhoneNumbers  = cf.no_phone_numbers_in_response ?? false;

              const hasRestrictions = kbOnly || blockedTopics.length > 0 || blockedKeywords.length > 0
                || noPersonalData || noExternalLinks || noPhoneNumbers;

              // Critical edge-case: KB-only but zero collections = bot cannot answer anything
              const kbOnlyButEmpty = kbOnly && collections.length === 0;

              return (
                <div key={slug} className={`bg-white rounded-xl border ${meta.border} overflow-hidden shadow-sm flex flex-col`}>

                  {/* ── Compact header ────────────────────────────────────── */}
                  <div className={`${meta.headerBg} px-4 py-2.5 flex items-center gap-2`}>
                    <span className="text-xs font-bold text-white">{meta.name}</span>
                    <span className="text-[10px] text-white/60 capitalize">{tone}</span>
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
                      <span className={`w-1 h-1 rounded-full ${meta.dotColor} animate-pulse`} />
                      Active
                    </span>
                    {kbOnlyButEmpty && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold bg-red-500 text-white px-2 py-0.5 rounded-full">
                        <AlertCircle size={9} /> Config error
                      </span>
                    )}
                  </div>

                  {/* ── 2-column body ─────────────────────────────────────── */}
                  <div className="flex-1 grid grid-cols-2 divide-x divide-gray-100">

                    {/* LEFT: Knows About */}
                    <div className="px-3.5 py-3 space-y-2">
                      <div className="flex items-center gap-1 mb-1">
                        <BookOpen size={10} className="text-emerald-500" />
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Knows About</p>
                        {totalEntries > 0 && (
                          <span className="ml-auto text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-px rounded-full border border-emerald-100 tabular-nums">
                            {totalEntries}
                          </span>
                        )}
                      </div>

                      {kbOnlyButEmpty ? (
                        <p className="text-[10px] text-red-600 leading-snug">KB-only mode on but no collections — bot cannot answer.</p>
                      ) : collections.length === 0 ? (
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={10} className="text-gray-400 shrink-0" />
                          <p className="text-[10px] text-gray-400">General AI only — no KB configured</p>
                        </div>
                      ) : (
                        <>
                          {collections.map((col) => (
                            <div key={col.id} className="flex items-center gap-1.5">
                              <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                              <p className="text-[10px] text-gray-700 font-medium truncate flex-1">{col.name}</p>
                              <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                                {col.entry_count === 0
                                  ? <span className="text-amber-500">Empty</span>
                                  : col.entry_count}
                              </span>
                            </div>
                          ))}
                          <div className="flex items-center gap-1 pt-1 border-t border-gray-100">
                            {kbOnly
                              ? <><Lock size={9} className="text-violet-500 shrink-0" /><p className="text-[10px] text-violet-600">KB-only · no general AI</p></>
                              : <><Sparkles size={9} className="text-gray-400 shrink-0" /><p className="text-[10px] text-gray-400">+ general AI fallback</p></>
                            }
                          </div>
                        </>
                      )}
                    </div>

                    {/* RIGHT: Escalation + Restrictions stacked */}
                    <div className="flex flex-col divide-y divide-gray-100">

                      {/* Escalates When */}
                      <div className="px-3.5 py-3 space-y-1.5">
                        <div className="flex items-center gap-1 mb-1">
                          <ShieldAlert size={10} className="text-amber-500" />
                          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Escalates When</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-px rounded shrink-0">AI</span>
                          <p className="text-[10px] text-gray-600">Confidence &lt; <span className="font-bold text-amber-700">{Math.round(threshold * 100)}%</span></p>
                        </div>
                        {triggers.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {triggers.slice(0, 6).map((t) => (
                              <span key={t} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-px rounded-full font-medium">
                                {t}
                              </span>
                            ))}
                            {triggers.length > 6 && (
                              <span className="text-[10px] text-gray-400">+{triggers.length - 6}</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-[10px] text-gray-400">No keyword triggers</p>
                        )}
                      </div>

                      {/* Restrictions */}
                      <div className="px-3.5 py-3 space-y-1.5">
                        <div className="flex items-center gap-1 mb-1">
                          <ShieldOff size={10} className="text-red-400" />
                          <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Restrictions</p>
                        </div>
                        {!hasRestrictions ? (
                          <p className="text-[10px] text-gray-400">None — open topic responses</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {kbOnly && (
                              <span className="text-[10px] bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-px rounded-full font-medium flex items-center gap-0.5">
                                <Lock size={8} />KB-only
                              </span>
                            )}
                            {noPersonalData && (
                              <span className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-px rounded-full font-medium flex items-center gap-0.5">
                                <User size={8} />No personal data
                              </span>
                            )}
                            {noExternalLinks && (
                              <span className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-px rounded-full font-medium flex items-center gap-0.5">
                                <ExternalLink size={8} />No ext. links
                              </span>
                            )}
                            {noPhoneNumbers && (
                              <span className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-px rounded-full font-medium flex items-center gap-0.5">
                                <Phone size={8} />No phone nos.
                              </span>
                            )}
                            {blockedTopics.map((t) => (
                              <span key={t} className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-px rounded-full font-medium">{t}</span>
                            ))}
                            {blockedKeywords.slice(0, 4).map((k) => (
                              <span key={k} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-px rounded-full font-medium">{k}</span>
                            ))}
                            {blockedKeywords.length > 4 && (
                              <span className="text-[10px] text-gray-400">+{blockedKeywords.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* ── Footer ────────────────────────────────────────────── */}
                  <div className={`flex items-center gap-3 border-t ${meta.border} ${meta.accentBg} px-4 py-2`}>
                    <Link href="/knowledge-base" className={`flex items-center gap-1 text-[11px] font-semibold ${meta.accent} hover:underline`}>
                      <BookOpen size={10} />Knowledge Base
                    </Link>
                    <ChevronRight size={10} className="text-gray-300" />
                    <Link href="/guardrails" className={`flex items-center gap-1 text-[11px] font-semibold ${meta.accent} hover:underline`}>
                      <ShieldAlert size={10} />Guardrails
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent Conversations ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Recent Conversations</h3>
            <p className="text-xs text-gray-400 mt-0.5">Latest activity across all bots</p>
          </div>
          <Link
            href="/conversations"
            className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-semibold transition-colors bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-100"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {!recent?.length ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4 border border-emerald-100">
              <MessageSquare size={24} className="text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-gray-600">No conversations yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Send a WhatsApp message to your bot number to see conversations appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map((conv) => {
              const contact     = (conv.contacts as unknown) as { name: string | null; phone: string } | null;
              const displayName = contact?.name ?? contact?.phone ?? 'Unknown';
              const style       = STATUS_STYLES[conv.status] ?? STATUS_STYLES.resolved;
              const product     = PRODUCT_LABELS[conv.product_type];
              const diffMins    = Math.floor((Date.now() - new Date(conv.updated_at).getTime()) / 60000);
              const timeAgo     =
                diffMins < 1    ? 'Just now' :
                diffMins < 60   ? `${diffMins}m ago` :
                diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` :
                `${Math.floor(diffMins / 1440)}d ago`;

              const avatarColors = [
                'bg-emerald-100 text-emerald-700',
                'bg-sky-100 text-sky-700',
                'bg-violet-100 text-violet-700',
                'bg-amber-100 text-amber-700',
              ];
              const colorIdx = displayName.charCodeAt(0) % avatarColors.length;

              return (
                <Link
                  key={conv.id}
                  href={`/conversations/${conv.id}`}
                  className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/60 transition-colors group"
                >
                  <div className={`w-9 h-9 rounded-full ${avatarColors[colorIdx]} flex items-center justify-center font-bold text-xs shrink-0`}>
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-emerald-700 transition-colors">
                      {displayName}
                    </p>
                    {product && (
                      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${product.color}`}>
                        {product.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ring-1 ${style.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {conv.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-400 w-14 text-right tabular-nums">{timeAgo}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
