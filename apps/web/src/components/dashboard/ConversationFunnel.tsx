'use client';

import type { StageFunnelRow } from '@/app/actions/stage-funnel';

const STAGE_ORDERS: Record<string, string[]> = {
  support_bot:   ['greeting', 'triage', 'investigating', 'resolving', 'verifying', 'closing', 'escalated'],
  sales_bot:     ['greeting', 'qualifying', 'needs_analysis', 'pitching', 'objection_handling', 'closing', 'following_up'],
  lifecycle_bot: ['reactivation', 'value_delivery', 'engaging', 'converting', 'confirming', 'closing'],
  _default:      ['greeting', 'qualifying', 'resolving', 'following_up', 'closing'],
};

const BOT_LABELS: Record<string, string> = {
  support_bot:   'Support Bot',
  sales_bot:     'Sales Bot',
  lifecycle_bot: 'Lifecycle Bot',
};

const BOT_COLORS: Record<string, { bar: string; bg: string; text: string; badge: string }> = {
  support_bot:   { bar: 'bg-sky-500',    bg: 'bg-sky-50',    text: 'text-sky-700',    badge: 'bg-sky-100 text-sky-700'    },
  sales_bot:     { bar: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  lifecycle_bot: { bar: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700' },
};

function stageLabel(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface FunnelPanelProps {
  botType: string;
  rows:    StageFunnelRow[];
}

function FunnelPanel({ botType, rows }: FunnelPanelProps) {
  const order  = STAGE_ORDERS[botType] ?? STAGE_ORDERS['_default']!;
  const col    = BOT_COLORS[botType] ?? BOT_COLORS['sales_bot']!;
  const byStage: Record<string, number> = {};
  for (const r of rows) byStage[r.stage] = r.count;

  const stages = order.map(id => ({ id, count: byStage[id] ?? 0 }));
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  if (stages.every(s => s.count === 0)) {
    return (
      <div className={`rounded-2xl border ${col.bg} border-opacity-60 p-5`}>
        <p className={`text-xs font-semibold uppercase tracking-wider ${col.text} mb-3`}>
          {BOT_LABELS[botType] ?? botType}
        </p>
        <p className="text-xs text-gray-400 py-4 text-center">No stage transitions recorded yet.</p>
      </div>
    );
  }

  const topCount = stages[0]?.count ?? 1;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
      <p className={`text-xs font-bold uppercase tracking-wider mb-4 ${col.text}`}>
        {BOT_LABELS[botType] ?? botType} — Stage Funnel
      </p>
      <div className="space-y-2.5">
        {stages.map((s, i) => {
          const pct     = Math.round((s.count / maxCount) * 100);
          const dropPct = i > 0 && stages[i - 1]!.count > 0
            ? Math.round((1 - s.count / stages[i - 1]!.count) * 100)
            : null;

          return (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-right">
                <span className="text-[11px] text-gray-500 font-medium">{stageLabel(s.id)}</span>
              </div>
              <div className="flex-1 h-6 bg-gray-50 rounded-full overflow-hidden relative">
                <div
                  className={`h-full ${col.bar} rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-20 shrink-0 flex items-center gap-1.5">
                <span className="text-sm font-bold text-gray-700 tabular-nums">{s.count.toLocaleString()}</span>
                {dropPct !== null && dropPct > 0 && topCount > 0 && (
                  <span className="text-[10px] text-red-400 font-medium">−{dropPct}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-300 mt-3 text-right">Distinct conversations reaching each stage · last 30 days</p>
    </div>
  );
}

interface ConversationFunnelProps {
  rows: StageFunnelRow[];
}

export function ConversationFunnel({ rows }: ConversationFunnelProps) {
  const botTypes = [...new Set(rows.map(r => r.product_type))];
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
        <p className="text-sm font-medium text-gray-400">No stage data yet</p>
        <p className="text-xs text-gray-300 mt-1">Stage transitions will appear here once conversations advance through the flow.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {botTypes.map(bt => (
        <FunnelPanel key={bt} botType={bt} rows={rows.filter(r => r.product_type === bt)} />
      ))}
    </div>
  );
}
