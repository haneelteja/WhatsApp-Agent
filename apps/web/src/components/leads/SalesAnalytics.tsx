'use client';

import { TrendingUp, Clock, ArrowDown } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  pct: number;      // % of total leads
  dropPct: number;  // % drop from previous stage (0 for first)
  color: string;    // tailwind bg color
  text: string;     // tailwind text color
}

export interface SalesAnalyticsData {
  funnel: FunnelStage[];
  weeklyNew: { label: string; count: number }[];   // last 8 weeks, oldest first
  avgCloseDays: number | null;
  totalLeads: number;
  convertedLeads: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function FunnelBar({ stage, maxCount }: { stage: FunnelStage; maxCount: number }) {
  const barPct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
  return (
    <div className="group">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-medium text-slate-600 w-24 shrink-0">{stage.label}</span>
        <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
          <div
            className={`h-full rounded-full ${stage.color} transition-all duration-500 flex items-center px-2`}
            style={{ width: `${Math.max(barPct, 4)}%` }}
          >
            {stage.count > 0 && (
              <span className={`text-[10px] font-semibold ${stage.text} whitespace-nowrap`}>
                {stage.count}
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-slate-500 w-10 text-right tabular-nums">{stage.pct}%</span>
      </div>
      {stage.dropPct > 0 && (
        <div className="flex items-center gap-1 ml-24 mb-1">
          <ArrowDown size={9} className="text-slate-300" />
          <span className="text-[10px] text-slate-400">{stage.dropPct}% drop-off</span>
        </div>
      )}
    </div>
  );
}

function WeeklyChart({ weeks }: { weeks: { label: string; count: number }[] }) {
  const max = Math.max(...weeks.map(w => w.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-20">
      {weeks.map(week => {
        const heightPct = (week.count / max) * 100;
        return (
          <div key={week.label} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
              {week.label}: {week.count}
            </div>
            <div className="w-full flex items-end" style={{ height: '64px' }}>
              <div
                className="w-full bg-emerald-400 rounded-t transition-all duration-500 hover:bg-emerald-500"
                style={{ height: `${Math.max(heightPct, week.count > 0 ? 8 : 2)}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-400 leading-none">{week.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SalesAnalytics({ data }: { data: SalesAnalyticsData }) {
  const { funnel, weeklyNew, avgCloseDays, totalLeads, convertedLeads } = data;
  const maxCount = Math.max(...funnel.map(s => s.count), 1);
  const convRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* Funnel */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Stage Funnel</h3>
            <p className="text-xs text-slate-400 mt-0.5">Lead drop-off at each stage</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{convRate}%</span>
            <p className="text-[10px] text-slate-400 mt-0.5">overall conversion</p>
          </div>
        </div>
        <div className="space-y-0.5 mt-2">
          {funnel.map(stage => (
            <FunnelBar key={stage.key} stage={stage} maxCount={maxCount} />
          ))}
        </div>
      </div>

      {/* Right column: weekly chart + avg close */}
      <div className="flex flex-col gap-4">

        {/* Avg close time */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
            <Clock size={18} className="text-violet-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900 tabular-nums">
              {avgCloseDays !== null ? `${avgCloseDays}d` : '—'}
            </p>
            <p className="text-xs text-slate-500">Avg. days to convert</p>
          </div>
        </div>

        {/* Weekly new leads */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">New Leads</h3>
              <p className="text-xs text-slate-400 mt-0.5">Last 8 weeks</p>
            </div>
            <TrendingUp size={15} className="text-emerald-500" />
          </div>
          <WeeklyChart weeks={weeklyNew} />
        </div>

      </div>
    </div>
  );
}
