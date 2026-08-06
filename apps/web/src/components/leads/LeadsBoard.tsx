'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Phone, LayoutList, Columns, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import { updateLeadStageAction } from '@/app/actions/leads';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LeadData {
  id: string;
  stage: string | null;
  ai_vars: Record<string, string> | null;
  status: string;
  updated_at: string;
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

// ── Lead card ──────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  colKey,
  onStageChange,
  moving,
}: {
  lead: LeadData;
  colKey: ColKey;
  onStageChange: (id: string, col: ColKey) => void;
  moving: boolean;
}) {
  const name = displayName(lead.contacts);
  const tags = entities(lead);
  const col  = STAGE_COLUMNS.find(c => c.key === colKey)!;

  const NEXT_STAGES: ColKey[] = ['qualifying', 'resolving', 'following_up', 'closing', 'converted'];
  const currentIdx = NEXT_STAGES.indexOf(colKey);
  const nextStage  = NEXT_STAGES[currentIdx + 1] as ColKey | undefined;

  return (
    <div
      draggable={colKey !== 'converted'}
      onDragStart={e => {
        e.dataTransfer.setData('leadId', lead.id);
        e.dataTransfer.setData('fromCol', colKey);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 shadow-sm select-none transition-all
        ${colKey !== 'converted' ? 'cursor-grab active:cursor-grabbing hover:shadow-md hover:border-slate-300' : 'opacity-75'}
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
        <span className="text-[11px] text-slate-400 shrink-0">{formatRel(lead.updated_at)}</span>
      </div>

      {lead.contacts?.phone && (
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Phone size={10} /> {lead.contacts.phone}
        </div>
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

      {/* Stage badge + stage indicator */}
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${col.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
          {col.label}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Stage dropdown */}
          {colKey !== 'converted' && (
            <select
              aria-label="Move to stage"
              value={colKey}
              onChange={e => onStageChange(lead.id, e.target.value as ColKey)}
              onClick={e => e.stopPropagation()}
              className="text-[11px] text-slate-500 border border-slate-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 cursor-pointer"
            >
              {STAGE_COLUMNS.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          )}

          {/* Quick-advance arrow */}
          {nextStage && colKey !== 'converted' && (
            <button
              type="button"
              title={`Move to ${STAGE_COLUMNS.find(c => c.key === nextStage)?.label}`}
              onClick={() => onStageChange(lead.id, nextStage)}
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

      <Link
        href={`/conversations/${lead.id}`}
        className="block text-center text-[11px] text-violet-600 hover:text-violet-700 font-medium hover:underline pt-0.5"
        onClick={e => e.stopPropagation()}
      >
        View chat →
      </Link>
    </div>
  );
}

// ── Kanban column ──────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  leads,
  onDrop,
  onStageChange,
  movingIds,
}: {
  col: typeof STAGE_COLUMNS[number];
  leads: LeadData[];
  onDrop: (leadId: string, fromCol: ColKey, toCol: ColKey) => void;
  onStageChange: (id: string, col: ColKey) => void;
  movingIds: Set<string>;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] shrink-0">
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border ${col.header} mb-0`}>
        <span className="text-xs font-semibold">{col.label}</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>{leads.length}</span>
      </div>

      {/* Drop area */}
      <div
        onDragOver={e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const leadId = e.dataTransfer.getData('leadId');
          const fromCol = e.dataTransfer.getData('fromCol') as ColKey;
          if (leadId && fromCol !== col.key) {
            onDrop(leadId, fromCol, col.key);
          }
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
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            colKey={col.key}
            onStageChange={onStageChange}
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
  moving,
}: {
  lead: LeadData;
  onStageChange: (id: string, col: ColKey) => void;
  moving: boolean;
}) {
  const name    = displayName(lead.contacts);
  const colKey  = getColumnKey(lead);
  const col     = STAGE_COLUMNS.find(c => c.key === colKey)!;
  const tags    = entities(lead);

  const salesEsc = [...(lead.escalations ?? [])]
    .filter(e => e.trigger_reason?.toLowerCase().includes('sales lead'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return (
    <div className={`flex items-start gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors ${moving ? 'opacity-40' : ''}`}>
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
        </div>

        {lead.contacts?.phone && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <Phone size={11} className="text-slate-400" />
            <span className="text-xs text-slate-500">{lead.contacts.phone}</span>
          </div>
        )}

        {salesEsc && (
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

      <div className="shrink-0 flex flex-col items-end gap-2">
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

        <Link
          href={`/conversations/${lead.id}`}
          className="text-xs text-violet-600 hover:text-violet-700 font-medium hover:underline"
        >
          View chat →
        </Link>
      </div>
    </div>
  );
}

// ── Main board component ───────────────────────────────────────────────────────

export function LeadsBoard({ initialLeads }: { initialLeads: LeadData[] }) {
  const [leads,     setLeads]     = useState<LeadData[]>(initialLeads);
  const [view,      setView]      = useState<'list' | 'kanban'>('list');
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());

  const moveToStage = useCallback(async (leadId: string, toCol: ColKey) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const fromCol = getColumnKey(lead);
    if (fromCol === toCol) return;

    const isConverted = toCol === 'converted';
    const dbStage = isConverted ? 'closing' : toCol;

    // Optimistic update
    setMovingIds(s => new Set([...s, leadId]));
    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l;
      return {
        ...l,
        stage:      dbStage,
        status:     isConverted ? 'resolved' : l.status,
        updated_at: new Date().toISOString(),
      };
    }));

    const result = await updateLeadStageAction(leadId, dbStage as Parameters<typeof updateLeadStageAction>[1], isConverted);

    if (result.error) {
      // Revert on failure
      setLeads(prev => prev.map(l => l.id === leadId ? lead : l));
    }

    setMovingIds(s => { const n = new Set(s); n.delete(leadId); return n; });
  }, [leads]);

  const handleDrop = useCallback((leadId: string, _fromCol: ColKey, toCol: ColKey) => {
    void moveToStage(leadId, toCol);
  }, [moveToStage]);

  const handleStageChange = useCallback((id: string, col: ColKey) => {
    void moveToStage(id, col);
  }, [moveToStage]);

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
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

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        leads.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-sm">No leads yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {leads.map(lead => (
              <LeadListRow
                key={lead.id}
                lead={lead}
                onStageChange={handleStageChange}
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
                leads={leads.filter(l => getColumnKey(l) === col.key)}
                onDrop={handleDrop}
                onStageChange={handleStageChange}
                movingIds={movingIds}
              />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        {leads.length} lead{leads.length !== 1 ? 's' : ''}
        {view === 'kanban' ? ' · drag cards between columns or use the stage selector' : ' · use the stage selector to move leads'}
      </p>
    </div>
  );
}
