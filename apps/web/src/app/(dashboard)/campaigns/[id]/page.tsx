import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import {
  ArrowLeft, Users, MessageSquare, Phone, CheckCircle2, XCircle,
  Clock, PlayCircle, PauseCircle, Ban, PhoneCall, Voicemail,
} from 'lucide-react';
import Link from 'next/link';
import { CampaignActions } from './campaign-actions';

type CampaignRow = {
  id: string;
  name: string;
  channel: 'whatsapp' | 'voice' | 'both';
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  contact_count: number;
  product_slug: string;
  message_template: string | null;
  voice_script: string | null;
  schedule_at: string | null;
  stats: {
    total?: number;
    wa_sent?: number;
    wa_replied?: number;
    wa_failed?: number;
    calls_made?: number;
    calls_answered?: number;
    calls_voicemail?: number;
    calls_failed?: number;
  } | null;
  created_at: string;
  tenant_id: string;
};

type ContactRow = {
  id: string;
  phone_number: string;
  customer_name: string | null;
  whatsapp_status: string;
  voice_status: string;
  attempts: number;
  last_attempt_at: string | null;
  outcome_json: { intent?: string; resolved?: boolean; sentiment?: string; summary?: string } | null;
};

const WA_STATUS_STYLES: Record<string, string> = {
  pending:  'bg-gray-50 text-gray-500',
  sent:     'bg-sky-50 text-sky-600',
  replied:  'bg-emerald-50 text-emerald-700',
  failed:   'bg-red-50 text-red-600',
  skipped:  'bg-slate-50 text-slate-400',
};

const VOICE_STATUS_STYLES: Record<string, string> = {
  pending:   'bg-gray-50 text-gray-500',
  initiated: 'bg-violet-50 text-violet-600',
  answered:  'bg-emerald-50 text-emerald-700',
  voicemail: 'bg-amber-50 text-amber-600',
  no_answer: 'bg-orange-50 text-orange-600',
  failed:    'bg-red-50 text-red-600',
  skipped:   'bg-slate-50 text-slate-400',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  const tenantId = tenantUser?.tenant_id ?? '';

  const [{ data: campaign }, { data: contacts, count: totalContacts }] = await Promise.all([
    admin.from('campaigns').select('*').eq('id', id).eq('tenant_id', tenantId).single(),
    admin.from('campaign_contacts')
      .select('*', { count: 'exact' })
      .eq('campaign_id', id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(100),
  ]);

  if (!campaign) notFound();

  const camp    = campaign as CampaignRow;
  const contList = (contacts ?? []) as ContactRow[];
  const s = camp.stats ?? {};

  const canLaunch  = ['draft', 'paused', 'scheduled'].includes(camp.status);
  const canPause   = camp.status === 'running';
  const canCancel  = ['draft', 'scheduled', 'running', 'paused'].includes(camp.status);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/campaigns" className="mt-0.5 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={16} className="text-gray-500" />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{camp.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 capitalize">
                {camp.channel}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {camp.product_slug}
              </span>
              <span className="text-xs text-gray-400">Created {formatDate(camp.created_at)}</span>
            </div>
          </div>
        </div>
        <CampaignActions
          campaignId={camp.id}
          tenantId={tenantId}
          status={camp.status}
          canLaunch={canLaunch}
          canPause={canPause}
          canCancel={canCancel}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center mb-3">
            <Users size={15} className="text-slate-500" />
          </div>
          <p className="text-2xl font-bold tabular-nums text-gray-800">{camp.contact_count.toLocaleString('en-IN')}</p>
          <p className="text-xs font-semibold text-gray-700 mt-1">Total Contacts</p>
        </div>
        {camp.channel !== 'voice' && (
          <>
            <div className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center mb-3">
                <MessageSquare size={15} className="text-sky-600" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-sky-600">{(s.wa_sent ?? 0).toLocaleString('en-IN')}</p>
              <p className="text-xs font-semibold text-gray-700 mt-1">WA Sent</p>
              <p className="text-[11px] text-gray-400">{s.wa_replied ?? 0} replied</p>
            </div>
            <div className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                <CheckCircle2 size={15} className="text-emerald-600" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-emerald-600">{(s.wa_replied ?? 0).toLocaleString('en-IN')}</p>
              <p className="text-xs font-semibold text-gray-700 mt-1">WA Replies</p>
              <p className="text-[11px] text-gray-400">{s.wa_failed ?? 0} failed</p>
            </div>
          </>
        )}
        {camp.channel !== 'whatsapp' && (
          <>
            <div className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center mb-3">
                <Phone size={15} className="text-violet-600" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-violet-600">{(s.calls_made ?? 0).toLocaleString('en-IN')}</p>
              <p className="text-xs font-semibold text-gray-700 mt-1">Calls Made</p>
              <p className="text-[11px] text-gray-400">{s.calls_answered ?? 0} answered · {s.calls_voicemail ?? 0} voicemail</p>
            </div>
          </>
        )}
      </div>

      {/* Script / template preview */}
      {(camp.message_template || camp.voice_script) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {camp.message_template && (
            <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <MessageSquare size={12} /> WhatsApp Message Template
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{camp.message_template}</p>
            </div>
          )}
          {camp.voice_script && (
            <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Phone size={12} /> Voice Script / Greeting
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{camp.voice_script}</p>
            </div>
          )}
        </div>
      )}

      {/* Contact list */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-green-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Contacts</h3>
          <span className="text-xs text-gray-400">{totalContacts ?? 0} total</span>
        </div>

        {contList.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Users size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No contacts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Contact</th>
                  {camp.channel !== 'voice' && (
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">WhatsApp</th>
                  )}
                  {camp.channel !== 'whatsapp' && (
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Voice</th>
                  )}
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Attempts</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Last Try</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contList.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800 text-xs">{c.customer_name ?? '—'}</p>
                      <p className="text-[11px] text-gray-400 tabular-nums">{c.phone_number}</p>
                    </td>
                    {camp.channel !== 'voice' && (
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${WA_STATUS_STYLES[c.whatsapp_status] ?? 'bg-gray-50 text-gray-500'}`}>
                          {c.whatsapp_status}
                        </span>
                      </td>
                    )}
                    {camp.channel !== 'whatsapp' && (
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${VOICE_STATUS_STYLES[c.voice_status] ?? 'bg-gray-50 text-gray-500'}`}>
                          {c.voice_status}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">{c.attempts}</td>
                    <td className="px-4 py-3 text-[11px] text-gray-400">{formatDate(c.last_attempt_at)}</td>
                    <td className="px-4 py-3">
                      {c.outcome_json?.summary ? (
                        <p className="text-[11px] text-gray-500 line-clamp-1 max-w-[200px]">{c.outcome_json.summary}</p>
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
