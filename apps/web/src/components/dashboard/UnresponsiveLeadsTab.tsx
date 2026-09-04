'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { RotateCcw, MessageSquare, ChevronDown, Tag, StickyNote, Check } from 'lucide-react';
import type { DispositionCategory, UnresponsiveLead } from '@/app/actions/disposition';
import { setDispositionAction, reEngageLeadAction } from '@/app/actions/disposition';

const PRODUCT_LABELS: Record<string, { label: string; color: string }> = {
  support_bot:   { label: 'Support',   color: 'bg-sky-50 text-sky-600' },
  sales_bot:     { label: 'Sales',     color: 'bg-violet-50 text-violet-600' },
  lifecycle_bot: { label: 'Lifecycle', color: 'bg-orange-50 text-orange-600' },
};

const AVATAR_COLORS = [
  'bg-slate-100 text-slate-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─── Single lead card ─────────────────────────────────────────────────────────

function LeadCard({
  lead,
  categories,
}: {
  lead:       UnresponsiveLead;
  categories: DispositionCategory[];
}) {
  const [categoryId, setCategoryId] = useState<string | null>(lead.disposition_category_id);
  const [notes, setNotes]           = useState(lead.disposition_notes ?? '');
  const [showNotes, setShowNotes]   = useState(false);
  const [saved, setSaved]           = useState(false);
  const [isPending, startTransition] = useTransition();

  const displayName = lead.contact_name ?? lead.contact_phone ?? 'Unknown';
  const colorIdx    = displayName.charCodeAt(0) % AVATAR_COLORS.length;
  const product     = PRODUCT_LABELS[lead.product_type];
  const category    = categories.find(c => c.id === categoryId);

  function saveDisposition(newCatId: string | null) {
    setCategoryId(newCatId);
    startTransition(async () => {
      await setDispositionAction(lead.id, newCatId, notes || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });
  }

  function saveNotes() {
    startTransition(async () => {
      await setDispositionAction(lead.id, categoryId, notes.trim() || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });
  }

  function handleReEngage() {
    startTransition(async () => {
      await reEngageLeadAction(lead.id);
    });
  }

  return (
    <div className={`bg-white border rounded-2xl shadow-sm p-4 flex flex-col gap-3 transition-opacity ${isPending ? 'opacity-60' : ''}`}>
      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[colorIdx]} flex items-center justify-center font-bold text-sm shrink-0`}>
          {displayName[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
            {lead.contact_name && lead.contact_phone && (
              <p className="text-[11px] text-gray-400">{lead.contact_phone}</p>
            )}
            {product && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${product.color}`}>{product.label}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
            <span>Went cold {formatDate(lead.outcome_set_at ?? lead.updated_at)}</span>
            {(lead.lead_follow_up_count ?? 0) > 0 && (
              <span>{lead.lead_follow_up_count} follow-up{lead.lead_follow_up_count !== 1 ? 's' : ''} sent</span>
            )}
          </div>
        </div>
        <Link
          href={`/conversations/${lead.id}`}
          className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
          title="Open conversation"
        >
          <MessageSquare size={14} />
        </Link>
      </div>

      {/* Category picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <Tag size={11} className="text-gray-400 shrink-0" />
        <div className="relative">
          <select
            value={categoryId ?? ''}
            onChange={e => saveDisposition(e.target.value || null)}
            disabled={isPending}
            className="appearance-none text-xs font-medium pl-2 pr-6 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 disabled:opacity-50"
            style={category ? { borderColor: category.color, color: category.color } : {}}
            aria-label="Assign disposition category"
          >
            <option value="">Uncategorised</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        {category && (
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: category.color + '22', color: category.color }}
          >
            {category.name}
          </span>
        )}
        {saved && <Check size={12} className="text-emerald-500" />}
      </div>

      {/* Notes toggle + field */}
      <div>
        <button
          onClick={() => setShowNotes(v => !v)}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          <StickyNote size={11} />
          {notes ? 'Edit notes' : 'Add notes'}
        </button>
        {showNotes && (
          <div className="mt-1.5">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Said budget only frees up in Q4..."
              rows={2}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 placeholder:text-gray-300"
            />
            <button
              onClick={saveNotes}
              disabled={isPending}
              className="mt-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
            >
              Save note
            </button>
          </div>
        )}
        {!showNotes && notes && (
          <p className="mt-1 text-[11px] text-gray-500 italic line-clamp-1">{notes}</p>
        )}
      </div>

      {/* Re-engage */}
      <button
        onClick={handleReEngage}
        disabled={isPending}
        className="flex items-center gap-1.5 self-start text-xs font-semibold text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-40"
      >
        <RotateCcw size={12} />
        Re-engage
      </button>
    </div>
  );
}

// ─── Tab root ─────────────────────────────────────────────────────────────────

export function UnresponsiveLeadsTab({
  leads,
  categories,
}: {
  leads:      UnresponsiveLead[];
  categories: DispositionCategory[];
}) {
  const [filter, setFilter] = useState<string>('all');

  const visible = filter === 'all'
    ? leads
    : filter === 'uncategorised'
    ? leads.filter(l => !l.disposition_category_id)
    : leads.filter(l => l.disposition_category_id === filter);

  const uncatCount = leads.filter(l => !l.disposition_category_id).length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            filter === 'all'
              ? 'bg-slate-700 text-white border-slate-700'
              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
        >
          All ({leads.length})
        </button>
        {uncatCount > 0 && (
          <button
            onClick={() => setFilter('uncategorised')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              filter === 'uncategorised'
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
            }`}
          >
            Uncategorised ({uncatCount})
          </button>
        )}
        {categories.map(cat => {
          const count = leads.filter(l => l.disposition_category_id === cat.id).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                filter === cat.id ? 'text-white' : 'bg-white hover:opacity-90'
              }`}
              style={
                filter === cat.id
                  ? { background: cat.color, borderColor: cat.color }
                  : { borderColor: cat.color, color: cat.color }
              }
            >
              {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-4 border border-slate-100">
            <RotateCcw size={24} className="text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-gray-500">
            {filter === 'all' ? 'No unresponsive leads yet' : 'No leads in this category'}
          </p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs">
            {filter === 'all'
              ? 'When a contact stops responding after all follow-ups are sent, they appear here.'
              : 'Try a different filter or categorise some leads above.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map(lead => (
            <LeadCard key={lead.id} lead={lead} categories={categories} />
          ))}
        </div>
      )}
    </div>
  );
}
