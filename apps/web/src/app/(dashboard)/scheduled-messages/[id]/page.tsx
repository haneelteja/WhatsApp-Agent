import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Users, CheckCircle2, AlertCircle, Clock, MessageSquare,
  ExternalLink, Repeat2, Bot, CalendarClock, XCircle, RefreshCw,
} from 'lucide-react';
import { getScheduledMessageAction, getRecipientLogAction } from '@/app/actions/scheduled-messages';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const STATUS_STYLES: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  scheduled: { label: 'Scheduled', cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: Clock        },
  running:   { label: 'Sending',   cls: 'bg-sky-50 text-sky-700 border-sky-200',          icon: RefreshCw    },
  completed: { label: 'Done',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  failed:    { label: 'Failed',    cls: 'bg-red-50 text-red-700 border-red-200',           icon: AlertCircle  },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-50 text-gray-500 border-gray-200',        icon: XCircle      },
};

const REC_STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-slate-50 text-slate-600 border-slate-200'       },
  sent:      { label: 'Sent',      cls: 'bg-sky-50 text-sky-700 border-sky-200'             },
  delivered: { label: 'Delivered', cls: 'bg-violet-50 text-violet-700 border-violet-200'    },
  read:      { label: 'Read',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed:    { label: 'Failed',    cls: 'bg-red-50 text-red-700 border-red-200'             },
  skipped:   { label: 'Skipped',   cls: 'bg-amber-50 text-amber-700 border-amber-200'       },
};

function recurrenceLabel(rec: { type: string; days_of_week?: number[]; day_of_month?: number }): string {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (rec.type === 'once')    return 'One-time';
  if (rec.type === 'daily')   return 'Repeats daily';
  if (rec.type === 'monthly') return `Repeats monthly on ${rec.day_of_month ?? '?'}`;
  if (rec.type === 'weekly' && rec.days_of_week?.length)
    return `Repeats weekly · ${rec.days_of_week.map(d => DAYS[d] ?? d).join(', ')}`;
  return rec.type;
}

export default async function ScheduledMessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [msg, { recipients, total }] = await Promise.all([
    getScheduledMessageAction(id),
    getRecipientLogAction(id),
  ]);
  if (!msg) notFound();

  // Check provider for display mode
  const admin = getSupabaseAdminClient();
  const { data: tenantUser } = await admin
    .from('tenant_users').select('tenant_id').eq('user_id', user.id).limit(1).single();
  const tenantId = tenantUser?.tenant_id ?? '';
  const { data: wn } = await admin
    .from('whatsapp_numbers').select('provider').eq('tenant_id', tenantId).eq('active', true).limit(1).single();
  const isWaba = wn?.provider === 'meta_cloud';

  const meta  = STATUS_STYLES[msg.status] ?? STATUS_STYLES['scheduled']!;
  const Icon  = meta.icon;
  const rec   = msg.recurrence as { type: string; days_of_week?: number[]; day_of_month?: number };

  const sentCount      = recipients.filter(r => ['sent', 'delivered', 'read'].includes(r.status)).length;
  const failedCount    = recipients.filter(r => ['failed', 'skipped'].includes(r.status)).length;
  const pendingCount   = recipients.filter(r => r.status === 'pending').length;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Back */}
      <Link href="/scheduled-messages" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <ChevronLeft size={15} /> Scheduled Messages
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <CalendarClock size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{msg.name}</h1>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold border px-2 py-0.5 rounded-full ${meta.cls}`}>
                  <Icon size={10} /> {meta.label}
                </span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock size={11} />
                  {new Date(msg.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                {rec.type !== 'once' && (
                  <span className="text-xs text-indigo-600 flex items-center gap-1">
                    <Repeat2 size={11} /> {recurrenceLabel(rec)}
                  </span>
                )}
                {msg.bot_handles_replies && (
                  <span className="text-xs text-emerald-600 flex items-center gap-1">
                    <Bot size={11} /> Bot handles replies
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Message preview */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {msg.message_body && (
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1"><MessageSquare size={10} /> Free-form</p>
              <p className="text-xs text-gray-700 whitespace-pre-wrap line-clamp-4">{msg.message_body}</p>
            </div>
          )}
          {msg.template_name && (
            <div className="p-3 bg-violet-50 rounded-xl border border-violet-100">
              <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-1">Template fallback</p>
              <p className="text-xs font-semibold text-violet-800">{msg.template_name}</p>
              <p className="text-[10px] text-violet-500 mt-0.5">{msg.template_language}</p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Sent',    value: sentCount,    icon: CheckCircle2, cls: 'text-emerald-600' },
            { label: 'Failed',  value: failedCount,  icon: AlertCircle,  cls: 'text-red-500'     },
            { label: 'Pending', value: pendingCount, icon: Clock,        cls: 'text-gray-400'    },
          ].map(({ label, value, icon: Ic, cls }) => (
            <div key={label} className="text-center p-3 bg-gray-50 rounded-xl border border-gray-100">
              <Ic size={14} className={`${cls} mx-auto mb-1`} />
              <p className={`text-lg font-bold ${cls}`}>{value}</p>
              <p className="text-[10px] text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recipient log */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
          <Users size={14} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">Recipients</h2>
          <span className="ml-auto text-xs text-gray-400">{total} total</span>
        </div>

        {recipients.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No recipients logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-50 text-left">
                  <th className="px-5 py-3 font-semibold text-gray-400 font-variant-numeric">Contact</th>
                  <th className="px-3 py-3 font-semibold text-gray-400">Session</th>
                  <th className="px-3 py-3 font-semibold text-gray-400">Type</th>
                  <th className="px-3 py-3 font-semibold text-gray-400">Status</th>
                  <th className="px-3 py-3 font-semibold text-gray-400">Sent at</th>
                  {isWaba && <th className="px-3 py-3 font-semibold text-gray-400">Conversation</th>}
                  <th className="px-3 py-3 font-semibold text-gray-400">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recipients.map(r => {
                  const st = REC_STATUS[r.status] ?? REC_STATUS['pending']!;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800">{r.contact_name ?? r.phone}</p>
                        {r.contact_name && <p className="text-gray-400">{r.phone}</p>}
                      </td>
                      <td className="px-3 py-3">
                        {r.session_status ? (
                          <span className={`inline-block px-1.5 py-0.5 rounded-full font-medium ${
                            r.session_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>{r.session_status}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-500 capitalize">{r.message_type ?? '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-1.5 py-0.5 rounded-full border font-semibold ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-3 text-gray-400">
                        {r.sent_at ? new Date(r.sent_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      {isWaba && (
                        <td className="px-3 py-3">
                          {r.conversation_id ? (
                            <Link href={`/conversations?id=${r.conversation_id}`}
                              className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800 font-medium">
                              View <ExternalLink size={10} />
                            </Link>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-3 text-red-500 max-w-xs truncate">{r.error_message ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
