'use client';

import type { OutcomeCount } from '@/app/actions/outcome-analytics';

const OUTCOME_META: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  converted:      { label: 'Converted',      color: 'text-emerald-700', bg: 'bg-emerald-500', desc: 'Agreed to buy / placed order' },
  not_interested: { label: 'Not Interested', color: 'text-red-700',     bg: 'bg-red-400',     desc: 'Explicitly said no' },
  wrong_fit:      { label: 'Wrong Fit',      color: 'text-orange-700',  bg: 'bg-orange-400',  desc: "Needs don't match offering" },
  no_budget:      { label: 'No Budget',      color: 'text-amber-700',   bg: 'bg-amber-400',   desc: 'Insufficient budget right now' },
  has_solution:   { label: 'Has Solution',   color: 'text-violet-700',  bg: 'bg-violet-400',  desc: 'Already uses a competitor' },
  bad_timing:     { label: 'Bad Timing',     color: 'text-sky-700',     bg: 'bg-sky-400',     desc: 'Interested but not right now' },
  unresponsive:   { label: 'Unresponsive',   color: 'text-slate-600',   bg: 'bg-slate-400',   desc: 'Went silent / stopped replying' },
  opted_out:      { label: 'Opted Out',      color: 'text-gray-600',    bg: 'bg-gray-400',    desc: 'Asked to stop receiving messages' },
  undeliverable:  { label: 'Undeliverable',  color: 'text-rose-700',    bg: 'bg-rose-400',    desc: 'Messages could not be delivered' },
};

interface OutcomeBreakdownProps {
  rows: OutcomeCount[];
}

export function OutcomeBreakdown({ rows }: OutcomeBreakdownProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-sm text-slate-400">No closed conversations yet.</p>
        <p className="text-xs text-slate-300 mt-1">Outcome data appears when conversations are resolved by the AI or a human agent.</p>
      </div>
    );
  }

  const total = rows.reduce((s, r) => s + r.count, 0);
  const maxCount = rows[0]?.count ?? 1;

  return (
    <div className="space-y-2">
      {rows.map(({ outcome, count }) => {
        const meta = OUTCOME_META[outcome] ?? { label: outcome, color: 'text-slate-700', bg: 'bg-slate-400', desc: '' };
        const pct  = total > 0 ? Math.round((count / total) * 100) : 0;
        const barW = Math.round((count / maxCount) * 100);

        return (
          <div key={outcome} className="flex items-center gap-3">
            <div className="w-28 shrink-0">
              <span className={`text-[11px] font-semibold ${meta.color}`}>{meta.label}</span>
              {meta.desc && <p className="text-[9px] text-slate-400 leading-tight">{meta.desc}</p>}
            </div>
            <div className="flex-1 relative h-5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${meta.bg} transition-all`}
                style={{ width: `${barW}%` }}
              />
            </div>
            <div className="w-16 text-right shrink-0">
              <span className="text-xs font-semibold text-slate-700">{count}</span>
              <span className="text-[10px] text-slate-400 ml-1">({pct}%)</span>
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-400 pt-2 text-right">{total} total closed conversations</p>
    </div>
  );
}
