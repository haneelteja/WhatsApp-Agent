'use client';

import { useState, useCallback, useTransition, useEffect } from 'react';
import Link from 'next/link';
import {
  Phone, LayoutList, Columns, ChevronRight, CheckCircle2, Loader2,
  MessageSquare, IndianRupee, StickyNote, Plus, ChevronDown, ChevronUp,
  X, Copy, Check, AlertTriangle, ExternalLink, RefreshCw,
} from 'lucide-react';
import { updateLeadStageAction } from '@/app/actions/leads';
import { getLeadNotesAction, addLeadNoteAction } from '@/app/actions/lead-notes';
import type { LeadNote } from '@alphabot/shared';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LeadData {
  id: string;
  stage: string | null;
  ai_vars: Record<string, string> | null;
  status: string;
  updated_at: string;
  lead_score: number;
  lead_follow_up_count: number;
  contacts: {
    id: string;
    phone: string | null;
    name: string | null;
    memory_json: { preferences?: Record<string, string> } | null;
  } | null;
  escalations: {
    id: string;
    trigger_reason: string;
    status: string;
    created_at: string;
    ai_summary: string | null;
  }[];
}

// ── Stage config ───────────────────────────────────────────────────────────────

const STAGE_COLUMNS = [
  {
    key:    'qualifying',
    dbKey:  'qualifying',
    label:  'Qualifying',
    color:  'blue',
    header: 'bg-blue-50 border-blue-200 text-blue-800',
    badge:  'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    dot:    'bg-blue-400',
    drop:   'border-blue-300 bg-blue-50/40',
  },
  {
    key:    'resolving',
    dbKey:  'resolving',
    label:  'Proposing',
    color:  'violet',
    header: 'bg-violet-50 border-violet-200 text-violet-800',
    badge:  'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    dot:    'bg-violet-400',
    drop:   'border-violet-300 bg-violet-50/40',
  },
  {
    key:    'following_up',
    dbKey:  'following_up',
    label:  'Following Up',
    color:  'amber',
    header: 'bg-amber-50 border-amber-200 text-amber-800',
    badge:  'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    dot:    'bg-amber-400',
    drop:   'border-amber-300 bg-amber-50/40',
  },
  {
    key:    'closing',
    dbKey:  'closing',
    label:  'Closing',
    color:  'orange',
    header: 'bg-orange-50 border-orange-200 text-orange-800',
    badge:  'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
    dot:    'bg-orange-400',
    drop:   'border-orange-300 bg-orange-50/40',
  },
  {
    key:    'converted',
    dbKey:  'closing',
    label:  'Converted',
    color:  'emerald',
    header: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    badge:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    dot:    'bg-emerald-400',
    drop:   'border-emerald-300 bg-emerald-50/40',
  },
] as const;

type ColKey = typeof STAGE_COLUMNS[number]['key'];

function getColumnKey(lead: LeadData): ColKey {
  if (lead.status === 'resolved') return 'converted';
  const s = lead.stage?.toLowerCase() ?? '';
  if (s.includes('closing'))      return 'closing';
  if (s.includes('following'))    return 'following_up';
  if (s.includes('resolv'))       return 'resolving';
  return 'qualifying';
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function displayName(c: LeadData['contacts']): string {
  if (!c) return 'Unknown';
  return c.name ?? c.phone ?? 'Unknown';
}

function formatRel(dateStr: string): string {
  const d   = Date.now() - new Date(dateStr).getTime();
  const m   = Math.floor(d / 60_000);
  const h   = Math.floor(d / 3_600_000);
  const day = Math.floor(d / 86_400_000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m`;
  if (h < 24)  return `${h}h`;
  if (day < 7) return `${day}d`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function entities(lead: LeadData) {
  const src = { ...(lead.ai_vars ?? {}), ...(lead.contacts?.memory_json?.preferences ?? {}) };
  return Object.entries(src)
    .filter(([, v]) => v && String(v).trim())
    .slice(0, 3)
    .map(([k, v]) => ({ key: k.replace(/_/g, ' '), value: String(v).slice(0, 30) }));
}

function extractBudget(aiVars: Record<string, string> | null): string | null {
  if (!aiVars) return null;
  const entry = Object.entries(aiVars).find(([k]) =>
    k.toLowerCase().match(/budget|price|cost|value|spend|inr|rupee/),
  );
  return entry ? String(entry[1]).slice(0, 20) : null;
}

function daysInPipeline(escalations: LeadData['escalations']): number {
  const earliest = escalations
    .map(e => new Date(e.created_at).getTime())
    .sort((a, b) => a - b)[0];
  if (!earliest) return 0;
  return Math.floor((Date.now() - earliest) / 86_400_000);
}

function isStale(lead: LeadData): boolean {
  if (lead.status === 'resolved') return false;
  return (Date.now() - new Date(lead.updated_at).getTime()) > 3 * 86_400_000;
}

function ScoreBadge({ score }: { score: number }) {
  const { text, bg } =
    score >= 70 ? { text: 'text-emerald-700', bg: 'bg-emerald-50 ring-emerald-200' }
    : score >= 40 ? { text: 'text-amber-700', bg: 'bg-amber-50 ring-amber-200' }
    : { text: 'text-red-600', bg: 'bg-red-50 ring-red-200' };
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold ring-1 ${bg} ${text}`}>
      {score >= 70 ? '●' : score >= 40 ? '◐' : '○'} {score}
    </span>
  );
}

// ── Lead detail drawer ─────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

function LeadDrawer({
  lead,
  onClose,
  onStageChange,
  moving,
}: {
  lead: LeadData;
  onClose: () => void;
  onStageChange: (id: string, col: ColKey) => void;
  moving: boolean;
}) {
  const name     = displayName(lead.contacts);
  const colKey   = getColumnKey(lead);
  const col      = STAGE_COLUMNS.find(c => c.key === colKey)!;
  const days     = daysInPipeline(lead.escalations);
  const stale    = isStale(lead);
  const allVars  = { ...(lead.ai_vars ?? {}), ...(lead.contacts?.memory_json?.preferences ?? {}) };
  const varList  = Object.entries(allVars).filter(([, v]) => v && String(v).trim());

  const salesEscalations = [...(lead.escalations ?? [])]
    .filter(e => e.trigger_reason?.toLowerCase().includes('sales lead') || e.trigger_reason?.includes('[SALES_LEAD]'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const bestSummary = salesEscalations.find(e => e.ai_summary)?.ai_summary ?? null;

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0 text-violet-700 font-bold text-sm">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900 text-sm">{name}</span>
              <ScoreBadge score={lead.lead_score ?? 0} />
              {stale && (
                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ring-1 ring-amber-200">
                  <AlertTriangle size={9} /> Stale {days}d
                </span>
              )}
            </div>
            <div className={`inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${col.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
              {col.label}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Contact info */}
          <section>
            <h4 className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Contact</h4>
            <div className="space-y-1">
              {lead.contacts?.phone && (
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Phone size={13} className="text-slate-400 shrink-0" />
                  <a href={`tel:${lead.contacts.phone}`} className="hover:text-violet-600 transition-colors">
                    {lead.contacts.phone}
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <RefreshCw size={11} className="text-slate-400 shrink-0" />
                {days > 0 ? `${days} day${days !== 1 ? 's' : ''} in pipeline` : 'Added today'}
                {lead.lead_follow_up_count > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[10px] font-semibold ring-1 ring-violet-200">
                    {lead.lead_follow_up_count}/3 follow-ups sent
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* AI handoff summary */}
          {bestSummary && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Handoff Brief</h4>
                <CopyButton text={bestSummary} label="Copy brief" />
              </div>
              <div className="bg-violet-50 rounded-xl px-4 py-3 space-y-1">
                {bestSummary.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i} className="text-xs text-violet-800 leading-relaxed">{line}</p>
                ))}
              </div>
            </section>
          )}

          {/* Captured entities */}
          {varList.length > 0 && (
            <section>
              <h4 className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Captured Details</h4>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                {varList.map(([k, v], i) => (
                  <div key={k} className={`flex items-start gap-3 px-3 py-2 text-xs ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <span className="text-slate-400 capitalize w-28 shrink-0 truncate">{k.replace(/_/g, ' ')}</span>
                    <span className="text-slate-700 font-medium">{String(v)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Lead timeline */}
          {salesEscalations.length > 0 && (
            <section>
              <h4 className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Lead History</h4>
              <div className="space-y-2">
                {salesEscalations.map(e => (
                  <div key={e.id} className="flex items-start gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 mt-1" />
                    <div>
                      <span className="text-slate-500">{new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="text-slate-600">
                        {e.trigger_reason.replace(/\[SALES_LEAD\]/gi, '').replace(/\[STAGE:[^\]]+\]/gi, '').trim() || 'Sales lead detected'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Notes */}
          <section>
            <h4 className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Notes</h4>
            <NotesPanel conversationId={lead.id} noBorder />
          </section>

        </div>

        {/* Footer actions */}
        <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-2 bg-slate-50">
          {colKey !== 'converted' && (
            <select
              aria-label="Move to stage"
              value={colKey}
              disabled={moving}
              onChange={e => { onStageChange(lead.id, e.target.value as ColKey); onClose(); }}
              className="text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 flex-1"
            >
              {STAGE_COLUMNS.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          )}
          {moving && <Loader2 size={14} className="text-violet-400 animate-spin shrink-0" />}
          <Link
            href={`/conversations/${lead.id}`}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors shrink-0"
          >
            <ExternalLink size={12} /> Open chat
          </Link>
        </div>
      </div>
    </>
  );
}

// ── Notes drawer ───────────────────────────────────────────────────────────────

function NotesPanel({ conversationId, noBorder }: { conversationId: string; noBorder?: boolean }) {
  const [open, setOpen]     = useState(false);
  const [notes, setNotes]   = useState<LeadNote[] | null>(null);
  const [text, setText]     = useState('');
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);

  async function expand() {
    setOpen(o => !o);
    if (notes === null && !open) {
      setLoading(true);
      const result = await getLeadNotesAction(conversationId);
      setNotes(result.notes);
      setLoading(false);
    }
  }

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    const result = await addLeadNoteAction(conversationId, text);
    if (!result.error) {
      const newNote: LeadNote = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        tenant_id: '',
        author_name: 'You',
        note: text.trim(),
        created_at: new Date().toISOString(),
      };
      startTransition(() => setNotes(n => [newNote, ...(n ?? [])]));
      setText('');
    }
    setSaving(false);
  }

  return (
    <div className={noBorder ? '' : 'border-t border-slate-100 pt-2'}>
      <button
        type="button"
        onClick={expand}
        className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-violet-600 transition-colors w-full"
      >
        <StickyNote size={11} />
        Notes {notes !== null ? `(${notes.length})` : ''}
        {open ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {loading && <p className="text-[10px] text-slate-400">Loading…</p>}
          {notes?.map(n => (
            <div key={n.id} className="bg-slate-50 rounded-lg px-2 py-1.5">
              <p className="text-[10px] text-slate-500 mb-0.5">{n.author_name} · {formatRel(n.created_at)}</p>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{n.note}</p>
            </div>
          ))}
          {notes?.length === 0 && !loading && (
            <p className="text-[10px] text-slate-400 italic">No notes yet</p>
          )}
          <div className="flex gap-1 mt-1">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              placeholder="Add a note…"
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white min-w-0"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !text.trim()}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lead card ──────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  colKey,
  onStageChange,
  onOpen,
  moving,
}: {
  lead: LeadData;
  colKey: ColKey;
  onStageChange: (id: string, col: ColKey) => void;
  onOpen: (lead: LeadData) => void;
  moving: boolean;
}) {
  const name   = displayName(lead.contacts);
  const tags   = entities(lead);
  const col    = STAGE_COLUMNS.find(c => c.key === colKey)!;
  const budget = extractBudget(lead.ai_vars);
  const days   = daysInPipeline(lead.escalations);
  const stale  = isStale(lead);

  const NEXT_STAGES: ColKey[] = ['qualifying', 'resolving', 'following_up', 'closing', 'converted'];
  const currentIdx = NEXT_STAGES.indexOf(colKey);
  const nextStage  = NEXT_STAGES[currentIdx + 1] as ColKey | undefined;

  const summary = lead.escalations
    .filter(e => e.ai_summary)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.ai_summary;

  return (
    <div
      draggable={colKey !== 'converted'}
      onDragStart={e => {
        e.dataTransfer.setData('leadId', lead.id);
        e.dataTransfer.setData('fromCol', colKey);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(lead)}
      className={`bg-white rounded-xl border p-3.5 space-y-2.5 shadow-sm select-none transition-all
        ${stale ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200'}
        ${colKey !== 'converted' ? 'cursor-pointer hover:shadow-md hover:border-violet-200' : 'opacity-80 cursor-pointer hover:shadow-sm'}
        ${moving ? 'opacity-40 pointer-events-none' : ''}
      `}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0 text-violet-700 font-semibold text-xs">
            {name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-slate-900 truncate">{name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ScoreBadge score={lead.lead_score ?? 0} />
          <span className="text-[11px] text-slate-400">{formatRel(lead.updated_at)}</span>
        </div>
      </div>

      {lead.contacts?.phone && (
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Phone size={10} /> {lead.contacts.phone}
        </div>
      )}

      {/* Chips row */}
      <div className="flex flex-wrap gap-1">
        {budget && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px]">
            <IndianRupee size={9} /> {budget}
          </span>
        )}
        {days > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">
            {days}d in pipeline
          </span>
        )}
        {lead.lead_follow_up_count > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 text-[10px] ring-1 ring-violet-200">
            {lead.lead_follow_up_count}/3 follow-ups
          </span>
        )}
        {stale && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[10px] ring-1 ring-amber-200">
            <AlertTriangle size={8} /> Stale
          </span>
        )}
      </div>

      {/* AI summary (1 line) */}
      {summary && (
        <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed bg-violet-50 rounded px-2 py-1 flex gap-1">
          <MessageSquare size={9} className="shrink-0 mt-0.5 text-violet-400" />
          {summary.split('\n')[0]}
        </p>
      )}

      {/* Entity chips */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map(({ key, value }) => (
            <span key={key} className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[10px]">
              <span className="text-violet-400">{key}:</span> {value}
            </span>
          ))}
        </div>
      )}

      {/* Stage badge + controls */}
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${col.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
          {col.label}
        </span>

        <div className="flex items-center gap-1.5">
          {colKey !== 'converted' && (
            <select
              aria-label="Move to stage"
              value={colKey}
              onChange={e => { e.stopPropagation(); onStageChange(lead.id, e.target.value as ColKey); }}
              onClick={e => e.stopPropagation()}
              className="text-[11px] text-slate-500 border border-slate-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 cursor-pointer"
            >
              {STAGE_COLUMNS.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          )}

          {nextStage && colKey !== 'converted' && (
            <button
              type="button"
              title={`Move to ${STAGE_COLUMNS.find(c => c.key === nextStage)?.label}`}
              onClick={e => { e.stopPropagation(); onStageChange(lead.id, nextStage); }}
              className="w-6 h-6 rounded-lg flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-violet-50 hover:text-violet-600 transition-colors border border-slate-200"
            >
              <ChevronRight size={12} />
            </button>
          )}

          {colKey === 'converted' && (
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Kanban column ──────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  leads,
  onDrop,
  onStageChange,
  onOpen,
  movingIds,
}: {
  col: typeof STAGE_COLUMNS[number];
  leads: LeadData[];
  onDrop: (leadId: string, fromCol: ColKey, toCol: ColKey) => void;
  onStageChange: (id: string, col: ColKey) => void;
  onOpen: (lead: LeadData) => void;
  movingIds: Set<string>;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="flex flex-col min-w-[240px] w-[240px] shrink-0">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border ${col.header} mb-0`}>
        <span className="text-xs font-semibold">{col.label}</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>{leads.length}</span>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const leadId  = e.dataTransfer.getData('leadId');
          const fromCol = e.dataTransfer.getData('fromCol') as ColKey;
          if (leadId && fromCol !== col.key) onDrop(leadId, fromCol, col.key);
        }}
        className={`flex-1 min-h-[200px] rounded-b-xl border-x border-b p-2 space-y-2 transition-colors ${
          dragOver ? `${col.drop} border-dashed` : 'border-slate-200 bg-slate-50/40'
        }`}
      >
        {leads.length === 0 && (
          <div className="flex items-center justify-center h-20 text-[11px] text-slate-300">
            {dragOver ? 'Drop here' : 'No leads'}
          </div>
        )}
        {leads
          .sort((a, b) => (b.lead_score ?? 0) - (a.lead_score ?? 0))
          .map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              colKey={col.key}
              onStageChange={onStageChange}
              onOpen={onOpen}
              moving={movingIds.has(lead.id)}
            />
          ))}
      </div>
    </div>
  );
}

// ── List row ───────────────────────────────────────────────────────────────────

function LeadListRow({
  lead,
  onStageChange,
  onOpen,
  moving,
}: {
  lead: LeadData;
  onStageChange: (id: string, col: ColKey) => void;
  onOpen: (lead: LeadData) => void;
  moving: boolean;
}) {
  const name    = displayName(lead.contacts);
  const colKey  = getColumnKey(lead);
  const col     = STAGE_COLUMNS.find(c => c.key === colKey)!;
  const tags    = entities(lead);
  const budget  = extractBudget(lead.ai_vars);
  const days    = daysInPipeline(lead.escalations);
  const stale   = isStale(lead);

  const salesEsc = [...(lead.escalations ?? [])]
    .filter(e => e.trigger_reason?.toLowerCase().includes('sales lead'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  const summary = salesEsc?.ai_summary;

  return (
    <div
      onClick={() => onOpen(lead)}
      className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors
        ${stale ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50/70'}
        ${moving ? 'opacity-40 pointer-events-none' : ''}
      `}
    >
      <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center shrink-0 text-violet-700 font-semibold text-sm">
        {name.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">{name}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${col.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
            {col.label}
          </span>
          <ScoreBadge score={lead.lead_score ?? 0} />
          {stale && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ring-1 ring-amber-200">
              <AlertTriangle size={9} /> Stale {days}d
            </span>
          )}
          {lead.lead_follow_up_count > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-50 text-violet-600 ring-1 ring-violet-200">
              {lead.lead_follow_up_count}/3 follow-ups
            </span>
          )}
        </div>

        {lead.contacts?.phone && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <Phone size={11} className="text-slate-400" />
            <span className="text-xs text-slate-500">{lead.contacts.phone}</span>
            {budget && (
              <span className="flex items-center gap-0.5 text-xs text-emerald-700">
                <IndianRupee size={10} /> {budget}
              </span>
            )}
            {days > 0 && (
              <span className="text-xs text-slate-400">{days}d in pipeline</span>
            )}
          </div>
        )}

        {summary ? (
          <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
            {summary.split('\n').slice(0, 2).join(' · ')}
          </p>
        ) : salesEsc && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-1">
            <span className="text-slate-400">Lead reason: </span>
            {salesEsc.trigger_reason
              .replace(/\[SALES_LEAD\]/gi, '')
              .replace(/\[STAGE:[^\]]+\]/gi, '')
              .trim() || 'Sales opportunity detected'}
          </p>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map(({ key, value }) => (
              <span key={key} className="px-2 py-0.5 rounded-md text-xs bg-violet-50 text-violet-700">
                <span className="text-violet-400">{key}:</span> {value}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col items-end gap-2" onClick={e => e.stopPropagation()}>
        <span className="text-xs text-slate-400">{formatRel(lead.updated_at)}</span>
        {colKey !== 'converted' && (
          <select
            aria-label="Move to stage"
            value={colKey}
            onChange={e => onStageChange(lead.id, e.target.value as ColKey)}
            className="text-[11px] text-slate-500 border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            {STAGE_COLUMNS.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        )}
        {moving && <Loader2 size={12} className="text-violet-400 animate-spin" />}
        <span className="text-xs text-violet-500 font-medium">View details →</span>
      </div>
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

type ScoreFilter = 'all' | 'hot' | 'warm' | 'cold';

function FilterBar({
  search, onSearch,
  scoreFilter, onScoreFilter,
  sort, onSort,
}: {
  search: string; onSearch: (v: string) => void;
  scoreFilter: ScoreFilter; onScoreFilter: (v: ScoreFilter) => void;
  sort: 'score' | 'recent'; onSort: (v: 'score' | 'recent') => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={search}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search by name or phone…"
        className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white w-44"
      />
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
        {(['all', 'hot', 'warm', 'cold'] as ScoreFilter[]).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => onScoreFilter(f)}
            className={`text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors capitalize ${
              scoreFilter === f
                ? f === 'hot' ? 'bg-emerald-600 text-white'
                : f === 'warm' ? 'bg-amber-500 text-white'
                : f === 'cold' ? 'bg-red-500 text-white'
                : 'bg-violet-600 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {f === 'hot' ? '● 70+' : f === 'warm' ? '◐ 40-69' : f === 'cold' ? '○ <40' : 'All'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
        {(['score', 'recent'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onSort(s)}
            className={`text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors capitalize ${
              sort === s ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {s === 'score' ? 'By score' : 'Recent'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main board component ───────────────────────────────────────────────────────

export function LeadsBoard({ initialLeads }: { initialLeads: LeadData[] }) {
  const [leads,       setLeads]       = useState<LeadData[]>(initialLeads);
  const [view,        setView]        = useState<'list' | 'kanban'>('list');
  const [movingIds,   setMovingIds]   = useState<Set<string>>(new Set());
  const [search,      setSearch]      = useState('');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [sort,        setSort]        = useState<'score' | 'recent'>('recent');
  const [drawerLead,  setDrawerLead]  = useState<LeadData | null>(null);

  const filtered = leads.filter(l => {
    const q = search.toLowerCase();
    if (q && !displayName(l.contacts).toLowerCase().includes(q) && !(l.contacts?.phone ?? '').includes(q)) return false;
    const s = l.lead_score ?? 0;
    if (scoreFilter === 'hot'  && s < 70) return false;
    if (scoreFilter === 'warm' && (s < 40 || s >= 70)) return false;
    if (scoreFilter === 'cold' && s >= 40) return false;
    return true;
  }).sort((a, b) => {
    if (sort === 'score') return (b.lead_score ?? 0) - (a.lead_score ?? 0);
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const moveToStage = useCallback(async (leadId: string, toCol: ColKey) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const fromCol = getColumnKey(lead);
    if (fromCol === toCol) return;

    const isConverted = toCol === 'converted';
    const dbStage = isConverted ? 'closing' : toCol;

    setMovingIds(s => new Set([...s, leadId]));
    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, stage: dbStage, status: isConverted ? 'resolved' : l.status, updated_at: new Date().toISOString() };
    }));

    const result = await updateLeadStageAction(leadId, dbStage as Parameters<typeof updateLeadStageAction>[1], isConverted);
    if (result.error) setLeads(prev => prev.map(l => l.id === leadId ? lead : l));

    setMovingIds(s => { const n = new Set(s); n.delete(leadId); return n; });
  }, [leads]);

  const handleDrop        = useCallback((leadId: string, _fromCol: ColKey, toCol: ColKey) => void moveToStage(leadId, toCol), [moveToStage]);
  const handleStageChange = useCallback((id: string, col: ColKey) => void moveToStage(id, col), [moveToStage]);
  const handleOpen        = useCallback((lead: LeadData) => setDrawerLead(lead), []);
  const handleClose       = useCallback(() => setDrawerLead(null), []);

  // Keep drawer lead in sync when its stage is updated optimistically
  const drawerLeadSynced = drawerLead
    ? (leads.find(l => l.id === drawerLead.id) ?? drawerLead)
    : null;

  const avgScore = filtered.length
    ? Math.round(filtered.reduce((s, l) => s + (l.lead_score ?? 0), 0) / filtered.length)
    : 0;

  return (
    <div className="space-y-4">
      {/* Lead detail drawer */}
      {drawerLeadSynced && (
        <LeadDrawer
          lead={drawerLeadSynced}
          onClose={handleClose}
          onStageChange={handleStageChange}
          moving={movingIds.has(drawerLeadSynced.id)}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar
          search={search} onSearch={setSearch}
          scoreFilter={scoreFilter} onScoreFilter={setScoreFilter}
          sort={sort} onSort={setSort}
        />
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <span className="text-xs text-slate-400">
              Avg score: <span className="font-semibold text-slate-600">{avgScore}</span>
            </span>
          )}
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                view === 'list' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutList size={13} /> List
            </button>
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                view === 'kanban' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Columns size={13} /> Pipeline
            </button>
          </div>
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-sm">{leads.length === 0 ? 'No leads yet' : 'No leads match your filter'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {filtered.map(lead => (
              <LeadListRow
                key={lead.id}
                lead={lead}
                onStageChange={handleStageChange}
                onOpen={handleOpen}
                moving={movingIds.has(lead.id)}
              />
            ))}
          </div>
        )
      )}

      {/* ── KANBAN VIEW ── */}
      {view === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {STAGE_COLUMNS.map(col => (
              <KanbanColumn
                key={col.key}
                col={col}
                leads={filtered.filter(l => getColumnKey(l) === col.key)}
                onDrop={handleDrop}
                onStageChange={handleStageChange}
                onOpen={handleOpen}
                movingIds={movingIds}
              />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
        {filtered.length !== leads.length && ` (filtered from ${leads.length})`}
        {view === 'kanban' ? ' · drag cards between columns or use the stage selector' : ' · use the stage selector to move leads'}
      </p>
    </div>
  );
}
