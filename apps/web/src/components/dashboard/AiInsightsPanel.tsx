'use client';

import { useState } from 'react';
import {
  Sparkles, X, ArrowRight, Zap, BookOpen, ShieldCheck,
  Megaphone, MessageSquareMore, BarChart2, ChevronDown, ChevronUp,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { dismissInsightAction, type InsightRow, type InsightSuggestion } from '@/app/actions/insights';

const CATEGORY_META: Record<string, { icon: React.ElementType; color: string; bg: string; iconBg: string }> = {
  knowledge_base: { icon: BookOpen,          color: 'text-emerald-600', bg: 'bg-emerald-50',  iconBg: 'bg-emerald-100' },
  guardrails:     { icon: ShieldCheck,       color: 'text-violet-600',  bg: 'bg-violet-50',   iconBg: 'bg-violet-100'  },
  bot_config:     { icon: Zap,               color: 'text-sky-600',     bg: 'bg-sky-50',      iconBg: 'bg-sky-100'     },
  campaigns:      { icon: Megaphone,         color: 'text-orange-600',  bg: 'bg-orange-50',   iconBg: 'bg-orange-100'  },
  buttons:        { icon: MessageSquareMore, color: 'text-pink-600',    bg: 'bg-pink-50',     iconBg: 'bg-pink-100'    },
  general:        { icon: BarChart2,         color: 'text-gray-500',    bg: 'bg-gray-50',     iconBg: 'bg-gray-100'    },
};

const PRIORITY_META = {
  high:   { label: 'High',   badge: 'bg-red-100 text-red-700',     border: 'border-l-red-400',   dot: 'bg-red-400'   },
  medium: { label: 'Medium', badge: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400', dot: 'bg-amber-400' },
  low:    { label: 'Low',    badge: 'bg-slate-100 text-slate-600', border: 'border-l-slate-300', dot: 'bg-slate-400' },
};

function SuggestionCard({
  suggestion,
  insightId,
  onDismiss,
}: {
  suggestion: InsightSuggestion;
  insightId: string;
  onDismiss: (fp: string) => void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const cat  = CATEGORY_META[suggestion.category] ?? CATEGORY_META['general']!;
  const pri  = PRIORITY_META[suggestion.priority]  ?? PRIORITY_META['low']!;
  const Icon = cat.icon;

  async function handleDismiss() {
    setDismissing(true);
    await dismissInsightAction(insightId, suggestion.fingerprint);
    setDismissed(true);
    setTimeout(() => onDismiss(suggestion.fingerprint), 250);
    setDismissing(false);
  }

  return (
    <div
      className={`relative flex gap-3 p-3.5 rounded-xl border border-gray-100 bg-white border-l-4 ${pri.border} group transition-all duration-250 ${dismissed ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} shadow-sm hover:shadow-md`}
    >
      <div className={`w-8 h-8 rounded-lg ${cat.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon size={14} className={cat.color} />
      </div>

      <div className="flex-1 min-w-0 pr-5">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-gray-800 leading-snug flex-1">{suggestion.title}</p>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{suggestion.description}</p>
        <Link
          href={suggestion.action_link}
          className={`inline-flex items-center gap-1.5 mt-2.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${cat.bg} ${cat.color} hover:opacity-80 transition-opacity`}
        >
          Take action <ArrowRight size={11} />
        </Link>
      </div>

      <button
        type="button"
        onClick={() => void handleDismiss()}
        disabled={dismissing}
        className="absolute top-2.5 right-2.5 w-5 h-5 rounded-md flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all opacity-0 group-hover:opacity-100"
        title="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function PrioritySection({
  label,
  dot,
  suggestions,
  insightId,
  onDismiss,
}: {
  label: string;
  dot: string;
  suggestions: InsightSuggestion[];
  insightId: string;
  onDismiss: (fp: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-gray-300 font-medium">{suggestions.length}</span>
      </div>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <SuggestionCard
            key={s.fingerprint}
            suggestion={s}
            insightId={insightId}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}

export function AiInsightsPanel({ insight }: { insight: InsightRow | null }) {
  const [dismissed, setDismissed] = useState<string[]>(insight?.dismissed_fingerprints ?? []);
  const [collapsed, setCollapsed] = useState(false);

  const allSuggestions = insight?.suggestions ?? [];
  const visible = allSuggestions.filter((s) => !dismissed.includes(s.fingerprint));
  const addressedCount = allSuggestions.length - visible.length;

  const high   = visible.filter((s) => s.priority === 'high');
  const medium = visible.filter((s) => s.priority === 'medium');
  const low    = visible.filter((s) => s.priority === 'low');

  const headerSummary = [
    high.length   > 0 ? `${high.length} High`   : null,
    medium.length > 0 ? `${medium.length} Medium` : null,
    low.length    > 0 ? `${low.length} Low`      : null,
  ].filter(Boolean).join(' · ');

  if (!insight) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-50">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Sparkles size={13} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">AI Coach</h3>
            <p className="text-[10px] text-gray-400">Daily insights generated every morning</p>
          </div>
        </div>
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-400">
            {(() => {
              const nowUtc = new Date();
              const istHour = Math.floor((nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + 330) / 60) % 24;
              return `No insights yet — your first analysis will run at 6 AM IST ${istHour >= 6 ? 'tomorrow' : 'today'}.`;
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50/50 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
          <Sparkles size={13} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">AI Coach</h3>
          <p className="text-[10px] text-gray-400">
            Updated {generatedAt}
            {headerSummary ? ` · ${headerSummary}` : ''}
          </p>
        </div>
        {visible.length > 0 && (
          <span className="text-[10px] font-bold bg-violet-600 text-white px-2 py-0.5 rounded-full mr-1">
            {visible.length}
          </span>
        )}
        {collapsed
          ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
          : <ChevronUp   size={14} className="text-gray-400 shrink-0" />
        }
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="p-4">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <CheckCircle2 size={28} className="text-emerald-400" />
              <p className="text-sm font-medium text-gray-600">All clear — great work!</p>
              <p className="text-xs text-gray-400">New suggestions will appear tomorrow at 6 AM IST.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <PrioritySection label="High"   dot={PRIORITY_META.high.dot}   suggestions={high}   insightId={insight.id} onDismiss={(fp) => setDismissed((d) => [...d, fp])} />
              <PrioritySection label="Medium" dot={PRIORITY_META.medium.dot} suggestions={medium} insightId={insight.id} onDismiss={(fp) => setDismissed((d) => [...d, fp])} />
              <PrioritySection label="Low"    dot={PRIORITY_META.low.dot}    suggestions={low}    insightId={insight.id} onDismiss={(fp) => setDismissed((d) => [...d, fp])} />

              {addressedCount > 0 && (
                <p className="text-center text-[10px] text-gray-300 pt-1">
                  {addressedCount} of {allSuggestions.length} suggestions addressed
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
