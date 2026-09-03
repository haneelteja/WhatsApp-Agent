import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarClock, Plus, CheckCircle2, Clock, AlertCircle,
  XCircle, RefreshCw, Users, ChevronRight, Repeat2,
} from 'lucide-react';
import { listScheduledMessagesAction } from '@/app/actions/scheduled-messages';
import { ScheduledMessageActions } from './ScheduledMessageActions';

const STATUS_STYLES: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     cls: 'bg-slate-50 text-slate-600 border-slate-200',   icon: Clock        },
  scheduled: { label: 'Scheduled', cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: Clock        },
  running:   { label: 'Sending',   cls: 'bg-sky-50 text-sky-700 border-sky-200',          icon: RefreshCw    },
  completed: { label: 'Done',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  failed:    { label: 'Failed',    cls: 'bg-red-50 text-red-700 border-red-200',           icon: AlertCircle  },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-50 text-gray-500 border-gray-200',        icon: XCircle      },
};

function recurrenceLabel(rec: { type: string; days_of_week?: number[]; day_of_month?: number }): string {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (rec.type === 'once')    return 'One-time';
  if (rec.type === 'daily')   return 'Daily';
  if (rec.type === 'monthly') return `Monthly on ${rec.day_of_month ?? '?'}`;
  if (rec.type === 'weekly' && rec.days_of_week?.length)
    return `Weekly · ${rec.days_of_week.map(d => DAYS[d] ?? d).join(', ')}`;
  return rec.type;
}

export default async function ScheduledMessagesPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { messages, total } = await listScheduledMessagesAction();

  const scheduled  = messages.filter(m => m.status === 'scheduled').length;
  const completed  = messages.filter(m => m.status === 'completed').length;
  const failed     = messages.filter(m => m.status === 'failed').length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <CalendarClock size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Scheduled Messages</h1>
            <p className="text-xs text-gray-400">Schedule outbound WhatsApp messages to one or many contacts</p>
          </div>
        </div>
        <Link
          href="/scheduled-messages/new"
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
        >
          <Plus size={15} />
          New Schedule
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: total,     icon: CalendarClock, cls: 'text-gray-700' },
          { label: 'Upcoming',  value: scheduled, icon: Clock,         cls: 'text-violet-700' },
          { label: 'Completed', value: completed, icon: CheckCircle2,  cls: 'text-emerald-700' },
          { label: 'Failed',    value: failed,    icon: AlertCircle,   cls: 'text-red-600' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <div className="flex items-center gap-2">
              <Icon size={16} className={cls} />
              <span className={`text-2xl font-bold ${cls}`}>{value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center">
              <CalendarClock size={22} className="text-violet-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">No scheduled messages yet</p>
            <p className="text-xs text-gray-400">Create your first schedule to send targeted WhatsApp messages</p>
            <Link
              href="/scheduled-messages/new"
              className="mt-2 inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={13} /> New Schedule
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {messages.map((msg) => {
              const meta   = STATUS_STYLES[msg.status] ?? STATUS_STYLES['scheduled']!;
              const Icon   = meta.icon;
              const rec    = msg.recurrence as { type: string; days_of_week?: number[]; day_of_month?: number };
              const isRecurring = rec.type !== 'once';

              return (
                <div key={msg.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        href={`/scheduled-messages/${msg.id}`}
                        className="text-sm font-semibold text-gray-800 hover:text-violet-700 transition-colors truncate"
                      >
                        {msg.name}
                      </Link>
                      {isRecurring && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                          <Repeat2 size={9} /> {recurrenceLabel(rec)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(msg.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={11} />
                        {msg.recipients.total} recipients
                        {msg.recipients.sent > 0 && <span className="text-emerald-600"> · {msg.recipients.sent} sent</span>}
                        {msg.recipients.failed > 0 && <span className="text-red-500"> · {msg.recipients.failed} failed</span>}
                      </span>
                      {!isRecurring && <span>{recurrenceLabel(rec)}</span>}
                    </div>
                  </div>

                  <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold border px-2 py-0.5 rounded-full ${meta.cls}`}>
                    <Icon size={10} />
                    {meta.label}
                  </span>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ScheduledMessageActions id={msg.id} status={msg.status} />
                    <Link
                      href={`/scheduled-messages/${msg.id}`}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <ChevronRight size={15} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
