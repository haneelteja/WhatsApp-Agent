import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Megaphone, MessageSquare, Phone, Users, CheckCircle2,
  Clock, PlayCircle, PauseCircle, Ban, PhoneCall,
} from 'lucide-react';
import Link from 'next/link';

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
};

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-slate-50 text-slate-600 border-slate-200',
  scheduled: 'bg-violet-50 text-violet-700 border-violet-200',
  running:   'bg-sky-50 text-sky-700 border-sky-200',
  paused:    'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_ICONS: Record<string, LucideIcon> = {
  draft:     Clock,
  scheduled: Clock,
  running:   PlayCircle,
  paused:    PauseCircle,
  completed: CheckCircle2,
  cancelled: Ban,
};

const CHANNEL_STYLES: Record<string, string> = {
  whatsapp: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  voice:    'bg-sky-50 text-sky-700 border-sky-200',
  both:     'bg-violet-50 text-violet-700 border-violet-200',
};

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  whatsapp: MessageSquare,
  voice:    Phone,
  both:     PhoneCall,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function completionPct(camp: CampaignRow): number {
  const total = camp.contact_count;
  if (!total) return 0;
  const stats = camp.stats ?? {};
  const done  = (stats.wa_sent ?? 0) + (stats.calls_made ?? 0);
  return Math.min(100, Math.round((done / (total * (camp.channel === 'both' ? 2 : 1))) * 100));
}

export default async function CampaignsPage() {
  const supabase = await getSupabaseServerClient();
  const admin    = getSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).single();
  const tenantId = tenantUser?.tenant_id ?? '';

  const [
    { data: campaigns, count: totalCampaigns },
    { count: runningCount },
    { count: completedCount },
  ] = await Promise.all([
    admin.from('campaigns')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('campaigns').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'running'),
    admin.from('campaigns').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'completed'),
  ]);

  const campaignList = (campaigns ?? []) as CampaignRow[];

  const totalContacts = campaignList.reduce((s, c) => s + c.contact_count, 0);
  const totalReplied  = campaignList.reduce((s, c) => s + (c.stats?.wa_replied ?? 0), 0);
  const totalAnswered = campaignList.reduce((s, c) => s + (c.stats?.calls_answered ?? 0), 0);

  const stats = [
    {
      label: 'Total Campaigns', value: (totalCampaigns ?? 0).toString(),
      sub: 'All time', icon: Megaphone, color: 'text-emerald-600', bg: 'bg-emerald-50',
    },
    {
      label: 'Running', value: (runningCount ?? 0).toString(),
      sub: 'Active now', icon: PlayCircle, color: 'text-sky-600', bg: 'bg-sky-50',
    },
    {
      label: 'Completed', value: (completedCount ?? 0).toString(),
      sub: 'Finished successfully', icon: CheckCircle2, color: 'text-violet-600', bg: 'bg-violet-50',
    },
    {
      label: 'Total Contacts', value: totalContacts.toLocaleString('en-IN'),
      sub: 'Across all campaigns', icon: Users, color: 'text-amber-600', bg: 'bg-amber-50',
    },
    {
      label: 'WA Replies', value: totalReplied.toLocaleString('en-IN'),
      sub: `${totalAnswered.toLocaleString('en-IN')} calls answered`, icon: MessageSquare, color: 'text-orange-600', bg: 'bg-orange-50',
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Campaigns</h2>
          <p className="text-sm text-gray-500 mt-0.5">Bulk outbound — WhatsApp, voice calls, or both</p>
        </div>
        <Link
          href="/campaigns/new"
          className="text-sm font-medium bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors"
        >
          + New Campaign
        </Link>
      </div>

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

      <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-green-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">All Campaigns</h3>
          <span className="text-xs text-gray-400">{totalCampaigns ?? 0} total</span>
        </div>

        {campaignList.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Megaphone size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-400">No campaigns yet</p>
            <p className="text-xs text-gray-300 mt-1">Create a campaign to send bulk WhatsApp messages or voice calls to your contacts.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {campaignList.map(camp => {
              const StatusIcon  = STATUS_ICONS[camp.status] ?? Clock;
              const ChannelIcon = CHANNEL_ICONS[camp.channel] ?? Megaphone;
              const pct = completionPct(camp);
              const s   = camp.stats ?? {};

              return (
                <Link
                  key={camp.id}
                  href={`/campaigns/${camp.id}`}
                  className="block px-5 py-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      camp.channel === 'whatsapp' ? 'bg-emerald-100' :
                      camp.channel === 'voice'    ? 'bg-sky-100' :
                      'bg-violet-100'
                    }`}>
                      <ChannelIcon size={14} className="text-gray-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{camp.name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[camp.status] ?? 'bg-gray-50 text-gray-500'}`}>
                          <StatusIcon size={9} className="inline mr-1" />
                          {camp.status}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CHANNEL_STYLES[camp.channel] ?? 'bg-gray-50 text-gray-500'}`}>
                          {camp.channel}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                          {camp.product_slug}
                        </span>
                      </div>

                      {camp.status !== 'draft' && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 tabular-nums">{pct}%</span>
                        </div>
                      )}

                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Users size={10} />
                          {camp.contact_count.toLocaleString('en-IN')} contacts
                        </span>
                        {camp.channel !== 'voice' && (
                          <>
                            <span>{s.wa_sent ?? 0} sent</span>
                            {(s.wa_replied ?? 0) > 0 && <span className="text-emerald-500">{s.wa_replied} replied</span>}
                            {(s.wa_failed ?? 0) > 0 && <span className="text-red-400">{s.wa_failed} failed</span>}
                          </>
                        )}
                        {camp.channel !== 'whatsapp' && (
                          <>
                            <span>{s.calls_made ?? 0} calls</span>
                            {(s.calls_answered ?? 0) > 0 && <span className="text-sky-500">{s.calls_answered} answered</span>}
                          </>
                        )}
                        <span className="ml-auto">{formatDate(camp.created_at)}</span>
                      </div>
                    </div>
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
