'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, XCircle, PackageCheck, Loader2 } from 'lucide-react';
import { updateReturnStatusAction } from '@/app/actions/returns';
import type { ReturnRequest } from '@/app/actions/returns';

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  approved:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rejected:  'bg-red-50 text-red-700 ring-1 ring-red-200',
  completed: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

const TYPE_LABEL: Record<string, string> = {
  return:      'Return',
  replacement: 'Replacement',
};

export function ReturnRequestCard({ request }: { request: ReturnRequest }) {
  const [notes, setNotes]     = useState(request.staff_notes ?? '');
  const [error, setError]     = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const contact = request.contact;
  const phone   = contact?.phone ?? '—';
  const name    = contact?.name  ?? phone;

  function act(status: 'approved' | 'rejected' | 'completed') {
    setError(null);
    startTransition(async () => {
      try {
        await updateReturnStatusAction(request.id, status, notes);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update');
      }
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{name}</span>
            <span className="text-xs text-slate-400">{phone}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${request.type === 'replacement' ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'}`}>
              {TYPE_LABEL[request.type]}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {new Date(request.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[request.status]}`}>
          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
        </span>
      </div>

      {/* Reason */}
      {request.reason && (
        <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 italic">
          &ldquo;{request.reason}&rdquo;
        </p>
      )}

      {/* Staff notes */}
      <textarea
        rows={2}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Staff notes (optional)…"
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none placeholder:text-slate-300"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Actions — only shown when not completed */}
      {request.status !== 'completed' && (
        <div className="flex gap-2 flex-wrap">
          {request.status !== 'approved' && (
            <button
              onClick={() => act('approved')}
              disabled={pending}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Approve
            </button>
          )}
          {request.status !== 'rejected' && (
            <button
              onClick={() => act('rejected')}
              disabled={pending}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              Reject
            </button>
          )}
          {request.status === 'approved' && (
            <button
              onClick={() => act('completed')}
              disabled={pending}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <PackageCheck size={12} />}
              Mark Completed
            </button>
          )}
        </div>
      )}
    </div>
  );
}
