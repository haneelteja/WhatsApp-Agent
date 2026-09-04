'use client';

import { useState } from 'react';
import {
  Sparkles, ArrowRight, Zap, BookOpen, ShieldCheck,
  Megaphone, MessageSquareMore, BarChart2, ChevronDown,
  CheckCircle2, X, TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { dismissInsightAction, type InsightRow, type InsightSuggestion } from '@/app/actions/insights';

const CATEGORY_META: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  knowledge_base: { icon: BookOpen,          color: 'text-emerald-600', bg: 'bg-emerald-50',  label: 'Knowledge Base' },
  guardrails:     { icon: ShieldCheck,       color: 'text-violet-600',  bg: 'bg-violet-50',   label: 'Guardrails'     },
  bot_config:     { icon: Zap,               color: 'text-sky-600',     bg: 'bg-sky-50',       label: 'Bot Config'     },
  campaigns:      { icon: Megaphone,         color: 'text-orange-600',  bg: 'bg-orange-50',   label: 'Campaigns'      },
  buttons:        { icon: MessageSquareMore, color: 'text-pink-600',    bg: 'bg-pink-50',      label: 'Buttons'        },
  general:        { icon: BarChart2,         color: 'text-gray-500',    bg: 'bg-gray-50',      label: 'General'        },
};

const PRIORITY_META = {
  high:   { label: 'High Impact',   badge: 'bg-rose-50 text-rose-600 ring-rose-200',    ring: 'ring-rose-100',   glow: 'from-rose-50'   },
  medium: { label: 'Medium Impact', badge: 'bg-amber-50 text-amber-600 ring-amber-200', ring: 'ring-amber-100',  glow: 'from-amber-50'  },
  low:    { label: 'Low Impact',    badge: 'bg-slate-50 text-slate-500 ring-slate-200', ring: 'ring-slate-100',  glow: 'from-slate-50'  },
};

function HealthRing({ score, total }: { score: number; total: number }) {
  const pct    = total === 0 ? 100 : Math.round(((total - score) / total) * 100);
  const radius = 20;
  const circ   = 2 * Math.PI * radius;
  const dash   = (pct / 100) * circ;

  const colour = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#f43f5e';

  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={radius} fill="none"
          stroke={colour} strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold" style={{ color: colour }}>{pct}%</span>
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  insightId,
  onDismiss,
}: {
  suggestion: InsightSuggestion;
  insightId: string;
  onDismiss: (fp: string) => void;
}) {
  const [open,      setOpen]      = useState(false);
  const [dismissing,setDismissing]= useState(false);
  const [dismissed, setDismissed] = useState(false);

  const cat  = CATEGORY_META[suggestion.category] ?? CATEGORY_META['general']!;
  const pri  = PRIORITY_META[suggestion.priority]  ?? PRIORITY_META['low']!;
  const Icon = cat.icon;

  async function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    setDismissing(true);
    await dismissInsightAction(insightId, suggestion.fingerprint);
    setDismissed(true);
    setTimeout(() => onDismiss(suggestion.fingerprint), 300);
    setDismissing(false);
  }

  return (
    <div
      className={`rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden transition-all duration-300 ${dismissed ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100'}`}
    >
      {/* Card header — always visible, click to expand */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition-colors"
      >
        <div className={`w-8 h-8 rounded-lg ${cat.bg} flex items-center justify-center shrink-0`}>
          <Icon size={14} className={cat.color} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-snug truncate pr-1">{suggestion.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 ${pri.badge}`}>
              {pri.label}
            </span>
            <span className="text-[10px] text-slate-400">{cat.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={dismissing}
            className="w-5 h-5 rounded-md flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-all"
            title="Mark as done"
          >
            <X size={11} />
          </button>
          <ChevronDown
            size={14}
            className={`text-slate-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className={`px-4 pb-4 bg-gradient-to-b ${pri.glow} to-white`}>
          <div className="w-full h-px bg-slate-100 mb-3" />
          <p className="text-xs text-slate-500 leading-relaxed mb-3">{suggestion.description}</p>
          <Link
            href={suggestion.action_link}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${cat.bg} ${cat.color} hover:opacity-80 transition-opacity`}
          >
            Fix this <ArrowRight size={11} />
          </Link>
        </div>
      )}
    </div>
  );
}

export function AiInsightsPanel({ insight }: { insight: InsightRow | null }) {
  const [dismissed, setDismissed] = useState<string[]>(insight?.dismissed_fingerprints ?? []);
  const [collapsed, setCollapsed] = useState(false);

  const allSuggestions = insight?.suggestions ?? [];
  const visible        = allSuggestions.filter((s) => !dismissed.includes(s.fingerprint));
  const addressedCount = allSuggestions.length - visible.length;

  const high   = visible.filter((s) => s.priority === 'high');
  const medium = visible.filter((s) => s.priority === 'medium');
  const low    = visible.filter((s) => s.priority === 'low');

  if (!insight) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-50">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm shadow-violet-200">
            <Sparkles size={14} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">AI Coach</h3>
            <p className="text-[10px] text-slate-400">Daily insights · runs every morning at 6 AM IST</p>
          </div>
        </div>
        <div className="px-5 py-10 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center mx-auto">
            <Sparkles size={20} className="text-violet-400" />
          </div>
          <p className="text-sm font-medium text-slate-600">Your first analysis is on its way</p>
          <p className="text-xs text-slate-400">
            {(() => {
              const nowUtc = new Date();
              const istHour = Math.floor((nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + 330) / 60) % 24;
              return `Check back ${istHour >= 6 ? 'tomorrow' : 'today'} at 6 AM IST for personalised coaching.`;
            })()}
          </p>
        </div>
      </div>
    );
  }

  const generatedAt = new Date(insight.generated_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-3 px-5 py-4 border-b border-slate-50 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm shadow-violet-200 shrink-0">
          <Sparkles size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-800">AI Coach</h3>
          <p className="text-[10px] text-slate-400">Updated {generatedAt}</p>
        </div>
        {visible.length > 0 ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {high.length   > 0 && <span className="text-[10px] font-bold bg-rose-50 text-rose-600 ring-1 ring-rose-200 px-2 py-0.5 rounded-full">{high.length} High</span>}
            {medium.length > 0 && <span className="text-[10px] font-bold bg-amber-50 text-amber-600 ring-1 ring-amber-200 px-2 py-0.5 rounded-full">{medium.length} Med</span>}
          </div>
        ) : (
          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200 shrink-0">All clear</span>
        )}
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="p-4 space-y-3">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">You&apos;re on top of everything</p>
                <p className="text-xs text-slate-400 mt-0.5">New recommendations will appear tomorrow at 6 AM IST.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Progress row */}
              <div className="flex items-center gap-4 px-1 pb-1">
                <HealthRing score={visible.length} total={allSuggestions.length} />
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {visible.length} thing{visible.length !== 1 ? 's' : ''} to improve
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {addressedCount > 0
                      ? `${addressedCount} of ${allSuggestions.length} addressed · keep going!`
                      : 'Click any card below to see what to fix.'}
                  </p>
                  {addressedCount > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <TrendingUp size={11} className="text-emerald-500" />
                      <span className="text-[10px] font-semibold text-emerald-600">Great progress!</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Grouped cards */}
              {[
                { items: high,   label: 'High Impact',   badge: 'bg-rose-50 text-rose-600 ring-rose-200'   },
                { items: medium, label: 'Medium Impact',  badge: 'bg-amber-50 text-amber-600 ring-amber-200' },
                { items: low,    label: 'Low Impact',     badge: 'bg-slate-50 text-slate-500 ring-slate-200' },
              ].filter(g => g.items.length > 0).map(group => (
                <div key={group.label}>
                  <div className="flex items-center gap-2 mb-1.5 px-0.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${group.badge}`}>
                      {group.label}
                    </span>
                    <span className="text-[10px] text-slate-300">{group.items.length} recommendation{group.items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((s) => (
                      <SuggestionCard
                        key={s.fingerprint}
                        suggestion={s}
                        insightId={insight.id}
                        onDismiss={(fp) => setDismissed((d) => [...d, fp])}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
