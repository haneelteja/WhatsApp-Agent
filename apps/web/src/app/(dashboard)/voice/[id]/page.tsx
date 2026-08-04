export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient }  from '@/lib/supabase/admin';
import { redirect, notFound }      from 'next/navigation';
import Link                        from 'next/link';
import {
  ArrowLeft, Phone, PhoneCall, Clock, Mic, Speaker,
  CheckCircle2, XCircle, AlertTriangle, IndianRupee,
  MessageSquare, Volume2, Target,
} from 'lucide-react';
import { RecordingPlayer } from './recording-player';

type VoiceCallDetail = {
  id:                  string;
  tenant_id:           string;
  conversation_id:     string | null;
  campaign_id:         string | null;
  direction:           string;
  from_number:         string;
  to_number:           string;
  product_slug:        string | null;
  telephony_provider:  string;
  telephony_call_sid:  string | null;
  stt_provider:        string;
  tts_provider:        string;
  status:              string;
  duration_seconds:    number | null;
  turn_count:          number;
  recording_url:       string | null;
  transcript:          string | null;
  outcome_json: {
    intent?:            string;
    product_interest?:  string;
    resolved?:          boolean;
    escalation_needed?: boolean;
    sentiment?:         'positive' | 'neutral' | 'negative' | 'frustrated';
    follow_up_action?:  string;
    summary?:           string;
  } | null;
  triggered_by:  string;
  cost_rupees:   number | null;
  error_message: string | null;
  created_at:    string;
  updated_at:    string;
};

const STATUS_STYLES: Record<string, { pill: string; label: string }> = {
  completed:   { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Completed'   },
  in_progress: { pill: 'bg-sky-50 text-sky-700 border-sky-200',             label: 'In Progress' },
  initiated:   { pill: 'bg-violet-50 text-violet-700 border-violet-200',    label: 'Initiated'   },
  ringing:     { pill: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'Ringing'     },
  failed:      { pill: 'bg-red-50 text-red-700 border-red-200',             label: 'Failed'      },
  no_answer:   { pill: 'bg-orange-50 text-orange-700 border-orange-200',    label: 'No Answer'   },
  voicemail:   { pill: 'bg-slate-50 text-slate-600 border-slate-200',       label: 'Voicemail'   },
  busy:        { pill: 'bg-red-50 text-red-700 border-red-200',             label: 'Busy'        },
};

const SENTIMENT_STYLES: Record<string, { emoji: string; color: string }> = {
  positive:   { emoji: '😊', color: 'text-emerald-600' },
  neutral:    { emoji: '😐', color: 'text-slate-500'   },
  negative:   { emoji: '😞', color: 'text-orange-600'  },
  frustrated: { emoji: '😤', color: 'text-red-600'     },
};

function formatDuration(s: number | null): string {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default async function VoiceCallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  const tenantId = tenantUser?.tenant_id ?? '';

  const { data } = await admin
    .from('voice_calls')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!data) notFound();

  const call = data as VoiceCallDetail;
  const status = STATUS_STYLES[call.status] ?? { pill: 'bg-gray-50 text-gray-500 border-gray-200', label: call.status };
  const sentiment = call.outcome_json?.sentiment ? SENTIMENT_STYLES[call.outcome_json.sentiment] : null;

  // Detect if recording_url is an actual recording (not the internal respond URL)
  const hasRecording = !!(
    call.recording_url &&
    !call.recording_url.includes('/api/voice/respond/') &&
    !call.recording_url.includes('/api/voice/twiml/')
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/voice" className="mt-0.5 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={16} className="text-gray-500" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900">
              {call.direction === 'outbound' ? 'Outbound' : 'Inbound'} Call
            </h2>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${status.pill}`}>
              {status.label}
            </span>
            {sentiment && (
              <span className={`text-sm font-medium ${sentiment.color}`} title={call.outcome_json?.sentiment}>
                {sentiment.emoji} {call.outcome_json?.sentiment}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 font-mono">{call.id}</p>
        </div>
      </div>

      {/* Numbers + Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 sm:col-span-1 bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2">
            <Phone size={13} className="text-gray-400" />
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">From → To</p>
          </div>
          <p className="text-sm font-semibold text-gray-800 tabular-nums">{call.from_number || '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">→ {call.to_number}</p>
        </div>
        <div className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock size={13} className="text-gray-400" />
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Duration</p>
          </div>
          <p className="text-xl font-bold tabular-nums text-gray-800">{formatDuration(call.duration_seconds)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{call.turn_count} turns</p>
        </div>
        <div className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2">
            <IndianRupee size={13} className="text-gray-400" />
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Cost</p>
          </div>
          <p className="text-xl font-bold tabular-nums text-gray-800">
            {call.cost_rupees != null ? `₹${call.cost_rupees.toFixed(2)}` : '—'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{call.triggered_by}</p>
        </div>
        <div className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2">
            <Mic size={13} className="text-gray-400" />
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Providers</p>
          </div>
          <p className="text-xs font-semibold text-gray-700 capitalize">{call.telephony_provider}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            STT: {call.stt_provider} · TTS: {call.tts_provider}
          </p>
        </div>
      </div>

      {/* Outcome */}
      {call.outcome_json && (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <Target size={12} /> Call Outcome
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {call.outcome_json.intent && (
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Intent</p>
                <p className="text-sm font-medium text-gray-700 capitalize">{call.outcome_json.intent}</p>
              </div>
            )}
            {call.outcome_json.product_interest && call.outcome_json.product_interest !== 'none' && (
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Product Interest</p>
                <p className="text-sm font-medium text-gray-700">{call.outcome_json.product_interest}</p>
              </div>
            )}
            {call.outcome_json.follow_up_action && call.outcome_json.follow_up_action !== 'none' && (
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Follow-up</p>
                <p className="text-sm font-medium text-gray-700 capitalize">{call.outcome_json.follow_up_action}</p>
              </div>
            )}
            <div className="flex items-center gap-3 col-span-2 sm:col-span-3 pt-2 border-t border-gray-50">
              <span className={`flex items-center gap-1 text-xs font-semibold ${call.outcome_json.resolved ? 'text-emerald-600' : 'text-red-500'}`}>
                {call.outcome_json.resolved
                  ? <><CheckCircle2 size={13} /> Resolved</>
                  : <><XCircle size={13} /> Unresolved</>
                }
              </span>
              {call.outcome_json.escalation_needed && (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <AlertTriangle size={13} /> Escalation needed
                </span>
              )}
            </div>
            {call.outcome_json.summary && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Summary</p>
                <p className="text-sm text-gray-600 leading-relaxed">{call.outcome_json.summary}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recording */}
      {hasRecording && (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Volume2 size={12} /> Call Recording
          </p>
          <RecordingPlayer url={call.recording_url!} />
        </div>
      )}

      {/* Transcript */}
      {call.transcript ? (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <MessageSquare size={12} /> Transcript
          </p>
          <div className="bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto">
            <pre className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-sans">
              {call.transcript}
            </pre>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <MessageSquare size={12} /> Transcript
          </p>
          <p className="text-sm text-gray-400 italic">
            {call.status === 'completed' ? 'No transcript captured for this call.' : 'Transcript available after call completes.'}
          </p>
        </div>
      )}

      {/* Error (if failed) */}
      {call.error_message && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Error</p>
          <p className="text-sm text-red-600">{call.error_message}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Details</p>
        {[
          { label: 'Call SID',      value: call.telephony_call_sid ?? '—', mono: true  },
          { label: 'Campaign',      value: call.campaign_id ?? '—',        mono: true  },
          { label: 'Conversation',  value: call.conversation_id ?? '—',    mono: true  },
          { label: 'Bot',           value: call.product_slug ?? '—',       mono: false },
          { label: 'Started',       value: formatDateTime(call.created_at), mono: false },
          { label: 'Last updated',  value: formatDateTime(call.updated_at), mono: false },
        ].map(r => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400 shrink-0">{r.label}</p>
            <p className={`text-xs text-slate-600 truncate ${r.mono ? 'font-mono' : ''}`}>{r.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
