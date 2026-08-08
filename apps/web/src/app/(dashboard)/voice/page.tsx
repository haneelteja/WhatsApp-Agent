export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Phone, PhoneCall, PhoneOff, PhoneMissed, Clock, TrendingUp, IndianRupee } from 'lucide-react';
import Link from 'next/link';
import { MakeCallButton } from '@/components/dashboard/MakeCallButton';

type VoiceCallRow = {
  id:          string;
  to_number:   string;
  from_number: string;
  status: string;
  direction: string;
  duration_seconds: number | null;
  turn_count: number;
  telephony_provider: string;
  stt_provider: string;
  triggered_by: string;
  cost_rupees: number | null;
  transcript: string | null;
  outcome_json: {
    intent?: string;
    resolved?: boolean;
    escalation_needed?: boolean;
    sentiment?: string;
    summary?: string;
  } | null;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  completed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  initiated:   'bg-violet-50 text-violet-700 border-violet-200',
  ringing:     'bg-amber-50 text-amber-700 border-amber-200',
  failed:      'bg-red-50 text-red-700 border-red-200',
  no_answer:   'bg-orange-50 text-orange-700 border-orange-200',
  voicemail:   'bg-slate-50 text-slate-600 border-slate-200',
  busy:        'bg-red-50 text-red-700 border-red-200',
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: '😊',
  neutral:  '😐',
  negative: '😞',
  frustrated: '😤',
};

function formatDuration(s: number | null): string {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default async function VoiceCallsPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  const tenantId = tenantUser?.tenant_id ?? '';

  const apiBase        = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://whatsapp-agent-fmtg.onrender.com';
  const thirtyDaysAgo  = new Date(Date.now() - 30 * 86400000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  const [
    { data: chartCalls },
    { data: calls, count: totalCalls },
    { count: completedCalls },
    { count: failedCalls },
    { count: voicemailCalls },
    { data: costData },
  ] = await Promise.all([
    admin.from('voice_calls')
      .select('created_at, status')
      .eq('tenant_id', tenantId)
      .gte('created_at', fourteenDaysAgo),
    admin.from('voice_calls')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('voice_calls').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'completed').gte('created_at', thirtyDaysAgo),
    admin.from('voice_calls').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'failed').gte('created_at', thirtyDaysAgo),
    admin.from('voice_calls').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'voicemail').gte('created_at', thirtyDaysAgo),
    admin.from('voice_calls')
      .select('cost_rupees, duration_seconds')
      .eq('tenant_id', tenantId)
      .gte('created_at', thirtyDaysAgo),
  ]);

  // Build 14-day chart data
  const dailyMap = new Map<string, number>();
  for (const c of (chartCalls ?? []) as Array<{ created_at: string }>) {
    const day = c.created_at.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const chartDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { key, label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), count: dailyMap.get(key) ?? 0 };
  });
  const chartMax = Math.max(...chartDays.map(d => d.count), 1);

  const callList = (calls ?? []) as VoiceCallRow[];
  const totalCost = (costData ?? []).reduce((s, c) => s + (c.cost_rupees ?? 0), 0);
  const avgDuration = (() => {
    const withDuration = (costData ?? []).filter(c => c.duration_seconds);
    return withDuration.length
      ? Math.round(withDuration.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / withDuration.length)
      : 0;
  })();

  const stats = [
    {
      label: 'Total Calls (30d)', value: (totalCalls ?? 0).toString(),
      sub: 'All statuses', icon: Phone, color: 'text-emerald-600', bg: 'bg-emerald-50',
    },
    {
      label: 'Completed', value: (completedCalls ?? 0).toString(),
      sub: 'Successfully answered', icon: PhoneCall, color: 'text-sky-600', bg: 'bg-sky-50',
    },
    {
      label: 'No Answer / Failed', value: ((failedCalls ?? 0) + (voicemailCalls ?? 0)).toString(),
      sub: `${voicemailCalls ?? 0} voicemail`, icon: PhoneMissed, color: 'text-orange-600', bg: 'bg-orange-50',
    },
    {
      label: 'Avg Duration', value: formatDuration(avgDuration),
      sub: 'Completed calls only', icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50',
    },
    {
      label: 'Est. Cost (30d)', value: `₹${totalCost.toFixed(2)}`,
      sub: 'All providers combined', icon: IndianRupee, color: 'text-amber-600', bg: 'bg-amber-50',
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Voice Calls</h2>
          <p className="text-sm text-gray-500 mt-0.5">AI voice call log — outbound escalations and campaigns</p>
        </div>
        <div className="flex items-center gap-2">
          <MakeCallButton tenantId={tenantId} productSlug="support_bot" apiBase={apiBase} />
          <Link
            href="/campaigns"
            className="text-sm font-medium border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl hover:bg-emerald-50 transition-colors"
          >
            + Campaign
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon size={15} className={s.color} />
            </div>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs font-semibold text-gray-700 mt-1">{s.label}</p>
            <p className="text-[11px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Daily calls chart */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Calls per day</h3>
          <span className="text-xs text-gray-400">Last 14 days</span>
        </div>
        <div className="flex items-end gap-1 h-24">
          {chartDays.map(day => (
            <div key={day.key} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="relative flex-1 w-full flex items-end">
                <div
                  className="w-full bg-emerald-500 rounded-t-sm group-hover:bg-emerald-400 transition-colors"
                  style={{ height: day.count === 0 ? '2px' : `${Math.max(4, (day.count / chartMax) * 80)}px`, opacity: day.count === 0 ? 0.2 : 1 }}
                  title={`${day.label}: ${day.count} call${day.count !== 1 ? 's' : ''}`}
                />
                {day.count > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {day.count}
                  </span>
                )}
              </div>
              <span className="text-[9px] text-gray-300 rotate-45 origin-left translate-y-1 hidden sm:block">
                {day.label.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-3 text-[10px] text-gray-300">
          <span>{chartDays[0]!.label}</span>
          <span>{chartDays[13]!.label}</span>
        </div>
      </div>

      {/* Call log */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-green-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Recent Calls</h3>
          <span className="text-xs text-gray-400">{totalCalls ?? 0} total</span>
        </div>

        {callList.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <PhoneOff size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-400">No voice calls yet</p>
            <p className="text-xs text-gray-300 mt-1">Enable voice in Guardrails → Per-Bot Config, then enable auto-dispatch on escalation.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {callList.map(call => (
              <Link key={call.id} href={`/voice/${call.id}`}
                className="block px-5 py-4 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    call.status === 'completed' ? 'bg-emerald-100' :
                    call.status === 'failed' || call.status === 'no_answer' ? 'bg-red-100' :
                    'bg-amber-100'
                  }`}>
                    {call.direction === 'inbound'
                      ? <PhoneCall size={14} className="text-gray-600" />
                      : <Phone size={14} className="text-gray-600" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{call.to_number}</span>
                      {call.from_number && (
                        <span className="text-[11px] text-gray-400">from {call.from_number}</span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[call.status] ?? 'bg-gray-50 text-gray-500'}`}>
                        {call.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        {call.triggered_by}
                      </span>
                      {call.outcome_json?.sentiment && (
                        <span title={call.outcome_json.sentiment}>
                          {SENTIMENT_EMOJI[call.outcome_json.sentiment]}
                        </span>
                      )}
                    </div>

                    {call.outcome_json?.summary && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{call.outcome_json.summary}</p>
                    )}

                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                      <span>{call.telephony_provider} · {call.stt_provider}</span>
                      <span>{formatDuration(call.duration_seconds)}</span>
                      {call.turn_count > 0 && <span>{call.turn_count} turns</span>}
                      {call.cost_rupees != null && <span>₹{call.cost_rupees.toFixed(2)}</span>}
                      {call.outcome_json?.resolved != null && (
                        <span className={call.outcome_json.resolved ? 'text-emerald-500' : 'text-red-400'}>
                          {call.outcome_json.resolved ? '✓ Resolved' : '✗ Unresolved'}
                        </span>
                      )}
                      <span className="ml-auto">{new Date(call.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <TrendingUp size={13} className="text-gray-200 mt-1.5 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
