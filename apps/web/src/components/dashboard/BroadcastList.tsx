'use client';

import { useTransition }   from 'react';
import { useRouter }       from 'next/navigation';
import { X, Send, Clock, CheckCircle2, AlertCircle, Loader2, Ban } from 'lucide-react';
import { cancelBroadcast } from '@/app/actions/broadcasts';
import type { BroadcastRow } from '@/app/actions/broadcasts';

const STATUS_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  draft:     { label: 'Draft',     icon: Clock,         cls: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'Scheduled', icon: Clock,         cls: 'bg-amber-50 text-amber-700' },
  sending:   { label: 'Sending…',  icon: Loader2,       cls: 'bg-sky-50 text-sky-700' },
  sent:      { label: 'Sent',      icon: CheckCircle2,  cls: 'bg-emerald-50 text-emerald-700' },
  failed:    { label: 'Failed',    icon: AlertCircle,   cls: 'bg-red-50 text-red-700' },
  cancelled: { label: 'Cancelled', icon: Ban,           cls: 'bg-slate-100 text-slate-500' },
};

const AUDIENCE_LABELS: Record<string, string> = {
  all:        'All contacts',
  recent_7d:  'Active last 7 days',
  recent_10d: 'Active last 10 days',
  groups:     'Selected groups',
};

function formatScheduled(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelative(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function CancelButton({ broadcastId }: { broadcastId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    startTransition(async () => {
      await cancelBroadcast(broadcastId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={pending}
      title="Cancel broadcast"
      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40"
    >
      <X size={10} />
      Cancel
    </button>
  );
}

export function BroadcastList({ broadcasts }: { broadcasts: BroadcastRow[] }) {
  if (broadcasts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-14 gap-3">
        <Send size={26} className="text-slate-200" />
        <p className="text-sm font-medium text-slate-400">No broadcasts yet</p>
        <p className="text-xs text-slate-300 text-center max-w-xs">
          Use the form above to send your first marketing or festival message.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-50 overflow-hidden">
      {broadcasts.map(b => {
        const meta = STATUS_META[b.status] ?? STATUS_META['draft']!;
        const Icon = meta.icon;
        const canCancel = ['draft', 'scheduled'].includes(b.status);
        const progress = b.total_count > 0 ? Math.round((b.sent_count / b.total_count) * 100) : null;

        return (
          <div key={b.id} className="flex items-start gap-4 px-5 py-4">
            {/* Status icon */}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.cls}`}>
              <Icon size={14} className={b.status === 'sending' ? 'animate-spin' : ''} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-800 truncate">{b.name}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.cls}`}>
                  {meta.label}
                </span>
              </div>

              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{b.message}</p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-slate-400">
                <span>{AUDIENCE_LABELS[b.audience_type] ?? b.audience_type}</span>
                {b.scheduled_at && <span>· Scheduled: {formatScheduled(b.scheduled_at)}</span>}
                <span>· {formatRelative(b.created_at)}</span>
              </div>

              {/* Progress bar (sending or sent) */}
              {b.total_count > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{b.sent_count.toLocaleString()} sent · {b.failed_count.toLocaleString()} failed · {b.total_count.toLocaleString()} total</span>
                    {progress !== null && <span>{progress}%</span>}
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all"
                      style={{ width: `${progress ?? 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            {canCancel && (
              <div className="shrink-0">
                <CancelButton broadcastId={b.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
