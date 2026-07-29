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
                <div key={slug} className={`bg-white rounded-2xl border ${meta.border} overflow-hidden shadow-sm flex flex-col`}>

                  {/* ── Card header ───────────────────────────────────────── */}
                  <div className={`${meta.headerBg} px-5 py-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Bot size={15} className="text-white/80 shrink-0" />
                          <span className="text-sm font-bold text-white">{meta.name}</span>
                        </div>
                        <p className="text-xs text-white/70 mt-0.5 leading-snug">{meta.desc}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-[10px] text-white/60 font-semibold uppercase tracking-wider">Tone:</span>
                          <span className="text-[10px] text-white font-semibold capitalize">{tone}</span>
                        </div>
                      </div>
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/90 bg-white/20 px-2.5 py-1 rounded-full shrink-0 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor} animate-pulse`} />
                        Active
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 divide-y divide-gray-100">

                    {/* ── Section 1: Knows About ────────────────────────── */}
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <BookOpen size={12} className="text-emerald-500" />
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Knows About</p>
                        {totalEntries > 0 && (
                          <span className="ml-auto text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 tabular-nums">
                            {totalEntries} entries
                          </span>
                        )}
                      </div>

                      {/* Critical: KB-only ON but no collections */}
                      {kbOnlyButEmpty ? (
                        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3">
                          <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-red-700">Configuration error</p>
                            <p className="text-[10px] text-red-600 mt-0.5 leading-snug">
                              KB-only mode is on but no knowledge base is configured. The bot will be unable to answer most questions. Add a KB collection immediately.
                            </p>
                          </div>
                        </div>

                      /* No collections, KB-only off → general AI fallback */
                      ) : collections.length === 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3">
                            <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-amber-800">No knowledge base configured</p>
                              <p className="text-[10px] text-amber-600 mt-0.5 leading-snug">
                                Bot answers from general AI knowledge only. Add KB collections for business-specific, accurate answers.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Sparkles size={11} className="text-gray-400 shrink-0" />
                            <p className="text-[10px] text-gray-400">Powered by general AI knowledge</p>
                          </div>
                        </div>

                      /* Collections present */
                      ) : (
                        <div className="space-y-2.5">
                          {collections.map((col) => (
                            <div key={col.id} className="flex items-start gap-2.5">
                              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                                <CheckCircle2 size={11} className="text-emerald-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 leading-tight">{col.name}</p>
                                {col.description && (
                                  <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{col.description}</p>
                                )}
                              </div>
                              {col.entry_count === 0 ? (
                                <span className="text-[10px] text-amber-500 font-semibold shrink-0 bg-amber-50 px-1.5 py-0.5 rounded">Empty</span>
                              ) : (
                                <span className="text-[10px] font-semibold text-gray-400 tabular-nums shrink-0">{col.entry_count}</span>
                              )}
                            </div>
                          ))}

                          {/* KB scope note */}
                          {kbOnly ? (
                            <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-1">
                              <Lock size={10} className="text-violet-500 shrink-0" />
                              <p className="text-[10px] text-violet-600 font-medium">Strictly limited to these collections only — no general AI</p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-1">
                              <Sparkles size={10} className="text-gray-400 shrink-0" />
                              <p className="text-[10px] text-gray-400">Also draws on general AI for topics not covered above</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Section 2: Escalates When ─────────────────────── */}
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <ShieldAlert size={12} className="text-amber-500" />
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Escalates to Agent When</p>
                      </div>

                      <div className="space-y-3">
                        {/* Confidence threshold — always present */}
                        <div className="flex items-center gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                            <span className="text-[8px] font-bold text-amber-700">AI</span>
                          </div>
                          <p className="text-xs text-gray-700">
                            AI confidence drops below{' '}
                            <span className="font-bold text-amber-700">{Math.round(threshold * 100)}%</span>
                          </p>
                        </div>

                        {/* Trigger phrases */}
                        {triggers.length > 0 ? (
                          <div>
                            <div className="flex items-center gap-2.5 mb-2">
                              <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                <MessageSquare size={9} className="text-amber-700" />
                              </div>
                              <p className="text-xs text-gray-700">Customer uses trigger phrases</p>
                            </div>
                            <div className="flex flex-wrap gap-1 pl-7">
                              {triggers.slice(0, 10).map((t) => (
                                <span key={t} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">
                                  {t}
                                </span>
                              ))}
                              {triggers.length > 10 && (
                                <span className="text-[10px] text-gray-400 self-center">+{triggers.length - 10} more</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                              <MessageSquare size={9} className="text-gray-400" />
                            </div>
                            <p className="text-xs text-gray-400">No keyword triggers configured</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Section 3: Restrictions & Guardrails ──────────── */}
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <ShieldOff size={12} className="text-red-400" />
                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Restrictions & Guardrails</p>
                      </div>

                      {!hasRestrictions ? (
                        <div className="flex items-center gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                            <CheckCircle2 size={11} className="text-gray-400" />
                          </div>
                          <p className="text-xs text-gray-400">No restrictions — bot can respond to any topic</p>
                        </div>
                      ) : (
                        <div className="space-y-3">

                          {/* KB-only mode callout */}
                          {kbOnly && (
                            <div className="flex items-start gap-2.5 bg-violet-50 border border-violet-100 rounded-xl px-3.5 py-2.5">
                              <Lock size={13} className="text-violet-600 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-bold text-violet-800">Knowledge-base only mode</p>
                                <p className="text-[10px] text-violet-600 mt-0.5 leading-snug">
                                  Bot strictly answers from its KB collections. Any question outside the knowledge base is declined.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Content filters */}
                          {(noPersonalData || noExternalLinks || noPhoneNumbers) && (
                            <div className="space-y-2">
                              {noPersonalData && (
                                <div className="flex items-center gap-2.5">
                                  <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                                    <User size={9} className="text-red-400" />
                                  </div>
                                  <p className="text-xs text-gray-600">Will not share or request personal data</p>
                                </div>
                              )}
                              {noExternalLinks && (
                                <div className="flex items-center gap-2.5">
                                  <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                                    <ExternalLink size={9} className="text-red-400" />
                                  </div>
                                  <p className="text-xs text-gray-600">Will not include external links in responses</p>
                                </div>
                              )}
                              {noPhoneNumbers && (
                                <div className="flex items-center gap-2.5">
                                  <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                                    <Phone size={9} className="text-red-400" />
                                  </div>
                                  <p className="text-xs text-gray-600">Will not share phone numbers in responses</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Blocked topics */}
                          {blockedTopics.length > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Blocked Topics</p>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  onBlockedTopic === 'escalate'
                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                    : 'bg-gray-100 text-gray-500 border-gray-200'
                                }`}>
                                  {onBlockedTopic === 'escalate' ? '→ escalates to agent' : '→ silently ignored'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {blockedTopics.map((t) => (
                                  <span key={t} className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-medium">{t}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Blocked keywords */}
                          {blockedKeywords.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Blocked Keywords</p>
                              <div className="flex flex-wrap gap-1">
                                {blockedKeywords.slice(0, 8).map((k) => (
                                  <span key={k} className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-medium">{k}</span>
                                ))}
                                {blockedKeywords.length > 8 && (
                                  <span className="text-[10px] text-gray-400 self-center">+{blockedKeywords.length - 8} more</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* ── Card footer ───────────────────────────────────────── */}
                  <div className={`flex items-center border-t ${meta.border} ${meta.accentBg} px-5 py-3`}>
                    <Link
                      href="/knowledge-base"
                      className={`flex items-center gap-1.5 text-xs font-semibold ${meta.accent} hover:underline`}
                    >
                      <BookOpen size={11} />
                      Knowledge Base
                    </Link>
                    <ChevronRight size={12} className="text-gray-300 mx-2" />
                    <Link
                      href="/guardrails"
                      className={`flex items-center gap-1.5 text-xs font-semibold ${meta.accent} hover:underline`}
                    >
                      <ShieldAlert size={11} />
                      Guardrails
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
