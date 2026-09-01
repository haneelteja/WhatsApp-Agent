'use client';

import { useState } from 'react';
import { Sparkles, X, ArrowRight, Zap, BookOpen, ShieldCheck, Megaphone, MessageSquareMore, BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { dismissInsightAction, type InsightRow, type InsightSuggestion } from '@/app/actions/insights';

const CATEGORY_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  knowledge_base: { icon: BookOpen,          color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  guardrails:     { icon: ShieldCheck,       color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-200'  },
  bot_config:     { icon: Zap,               color: 'text-sky-600',     bg: 'bg-sky-50 border-sky-200'        },
  campaigns:      { icon: Megaphone,         color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200'  },
  buttons:        { icon: MessageSquareMore, color: 'text-pink-600',    bg: 'bg-pink-50 border-pink-200'      },
  general:        { icon: BarChart2,         color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200'      },
};

const PRIORITY_META = {
  high:   { label: 'High',   badge: 'bg-red-100 text-red-700 border-red-200'       },
  medium: { label: 'Medium', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  low:    { label: 'Low',    badge: 'bg-slate-100 text-slate-600 border-slate-200' },
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
  const cat  = CATEGORY_META[suggestion.category] ?? CATEGORY_META['general']!;
  const pri  = PRIORITY_META[suggestion.priority]  ?? PRIORITY_META['low']!;
  const Icon = cat.icon;

  async function handleDismiss() {
    setDismissing(true);
    await dismissInsightAction(insightId, suggestion.fingerprint);
    onDismiss(suggestion.fingerprint);
    setDismissing(false);
  }

  return (
    <div className={`relative flex gap-3 p-3.5 rounded-xl border ${cat.bg} group`}>
      <div className={`w-8 h-8 rounded-lg bg-white border flex items-center justify-center shrink-0 shadow-sm ${cat.bg}`}>
        <Icon size={14} className={cat.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1">
          <p className="text-sm font-semibold text-gray-800 leading-snug flex-1">{suggestion.title}</p>
          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${pri.badge}`}>
            {pri.label}
          </span>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">{suggestion.description}</p>
        <Link
          href={suggestion.action_link}
          className={`inline-flex items-center gap-1 mt-2 text-[11px] font-semibold ${cat.color} hover:underline`}
        >
          Take action <ArrowRight size={10} />
        </Link>
      </div>
      <button
        type="button"
        onClick={() => void handleDismiss()}
        disabled={dismissing}
        className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 transition-colors opacity-0 group-hover:opacity-100"
        title="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function AiInsightsPanel({ insight }: { insight: InsightRow | null }) {
  const [dismissed, setDismissed] = useState<string[]>(insight?.dismissed_fingerprints ?? []);
  const [collapsed, setCollapsed] = useState(false);

  const visible = (insight?.suggestions ?? []).filter(
    (s) => !dismissed.includes(s.fingerprint),
  );

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
          <p className="text-[10px] text-gray-400">Updated {generatedAt}</p>
        </div>
        {visible.length > 0 && (
          <span className="text-[10px] font-bold bg-violet-600 text-white px-2 py-0.5 rounded-full mr-1">
            {visible.length}
          </span>
        )}
        {collapsed ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronUp size={14} className="text-gray-400 shrink-0" />}
      </button>

      {!collapsed && (
        <div className="p-4">
          {visible.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">All suggestions addressed! Check back tomorrow.</p>
          ) : (
            <div className="space-y-2.5">
              {visible.map((s) => (
                <SuggestionCard
                  key={s.fingerprint}
                  suggestion={s}
                  insightId={insight.id}
                  onDismiss={(fp) => setDismissed((d) => [...d, fp])}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
