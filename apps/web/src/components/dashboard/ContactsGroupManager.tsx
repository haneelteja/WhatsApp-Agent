'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Plus, Tag, X, ChevronDown, Sparkles, Bot, Check, AlertCircle } from 'lucide-react';
import {
  createContactGroup,
  addContactToGroup,
  removeContactFromGroup,
  suggestGroupForContact,
} from '@/app/actions/contact-groups';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupOption = { id: string; name: string; color: string; emoji: string };
export type AssignedGroup = { group_id: string; name: string; color: string; emoji: string; added_by: string };

const COLORS = [
  '#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b',
  '#f43f5e', '#f97316', '#6366f1', '#14b8a6',
  '#64748b', '#ec4899',
];
const EMOJIS = ['👥', '⭐', '🔥', '💎', '🎯', '💰', '🛒', '🤝', '📦', '🏆', '💡', '❤️'];

// ─── Inline "create group" form ───────────────────────────────────────────────

function CreateGroupInline({
  onCreated,
  onClose,
}: {
  onCreated: (g: GroupOption) => void;
  onClose:   () => void;
}) {
  const [name,    setName]    = useState('');
  const [color,   setColor]   = useState(COLORS[0]!);
  const [emoji,   setEmoji]   = useState(EMOJIS[0]!);
  const [error,   setError]   = useState<string | null>(null);
  const [pending, start]      = useTransition();

  function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return; }
    setError(null);
    start(async () => {
      const result = await createContactGroup(name.trim(), '', color, emoji);
      if (result.error) { setError(result.error); return; }
      if (result.id) {
        onCreated({ id: result.id, name: name.trim(), color, emoji });
      }
    });
  }

  return (
    <div className="bg-white border border-emerald-200 rounded-2xl shadow-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Tag size={13} className="text-emerald-600" /> New group
        </h4>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Name */}
      <input
        autoFocus
        value={name}
        onChange={e => { setName(e.target.value); setError(null); }}
        onKeyDown={e => e.key === 'Enter' && handleCreate()}
        placeholder="Group name, e.g. VIP Customers"
        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-gray-300"
      />

      {/* Color + Emoji side-by-side */}
      <div className="flex gap-4">
        <div className="flex-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-1 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Emoji</p>
          <div className="flex flex-wrap gap-1">
            {EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all ${
                  emoji === e ? 'bg-emerald-100 ring-2 ring-emerald-400' : 'hover:bg-gray-100'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
          style={{ backgroundColor: color + '20', border: `1px solid ${color}40` }}
        >
          {emoji}
        </span>
        <span className="text-sm font-semibold text-gray-700">{name || 'Group name'}</span>
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle size={11} /> {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={pending}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
        >
          <Plus size={13} />
          {pending ? 'Creating…' : 'Create group'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 border border-gray-200 text-sm text-gray-500 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Per-contact assign widget ─────────────────────────────────────────────────

export function ContactGroupBadges({
  contactId,
  allGroups,
  initialAssigned,
}: {
  contactId:       string;
  allGroups:       GroupOption[];
  initialAssigned: AssignedGroup[];
}) {
  const [assigned,    setAssigned]    = useState<AssignedGroup[]>(initialAssigned);
  const [open,        setOpen]        = useState(false);
  const [suggesting,  setSuggesting]  = useState(false);
  const [suggestion,  setSuggestion]  = useState<{ group_id: string; group_name: string; reason: string } | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [pending,     start]          = useTransition();
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const assignedIds = new Set(assigned.map(a => a.group_id));
  const unassigned  = allGroups.filter(g => !assignedIds.has(g.id));

  function handleAdd(g: GroupOption) {
    setOpen(false);
    setError(null);
    const snapshot = [...assigned];
    setAssigned(prev => [...prev, { group_id: g.id, name: g.name, color: g.color, emoji: g.emoji, added_by: 'manual' }]);
    start(async () => {
      const r = await addContactToGroup(contactId, g.id, 'manual');
      if (r.error) { setAssigned(snapshot); setError(r.error); }
    });
  }

  function handleRemove(groupId: string) {
    setError(null);
    const snapshot = [...assigned];
    setAssigned(prev => prev.filter(a => a.group_id !== groupId));
    start(async () => {
      const r = await removeContactFromGroup(contactId, groupId);
      if (r.error) { setAssigned(snapshot); setError(r.error); }
    });
  }

  async function handleSuggest() {
    setSuggesting(true);
    setSuggestion(null);
    setError(null);
    const r = await suggestGroupForContact(contactId);
    setSuggesting(false);
    if (r.error) { setError(r.error); return; }
    if (r.suggestion) setSuggestion(r.suggestion);
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    const g = allGroups.find(x => x.id === suggestion.group_id);
    if (!g) return;
    const snap = [...assigned];
    setAssigned(prev => [...prev, { group_id: g.id, name: g.name, color: g.color, emoji: g.emoji, added_by: 'ai' }]);
    setSuggestion(null);
    start(async () => {
      const r = await addContactToGroup(contactId, suggestion.group_id, 'ai', suggestion.reason);
      if (r.error) { setAssigned(snap); setError(r.error); }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2" onClick={e => e.stopPropagation()}>

      {/* Assigned pills */}
      {assigned.map(a => (
        <span
          key={a.group_id}
          className="group/pill flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: a.color + '18', color: a.color, border: `1px solid ${a.color}35` }}
        >
          {a.emoji} {a.name}
          <button
            type="button"
            onClick={() => handleRemove(a.group_id)}
            disabled={pending}
            className="ml-0.5 opacity-0 group-hover/pill:opacity-100 transition-opacity"
            title="Remove from group"
          >
            <X size={9} />
          </button>
        </span>
      ))}

      {/* Add dropdown */}
      {unassigned.length > 0 && (
        <div ref={dropRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            disabled={pending}
            title="Add to group"
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
          >
            <Plus size={9} />
            <ChevronDown size={9} />
          </button>
          {open && (
            <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-100 rounded-xl shadow-xl z-20 py-1">
              {unassigned.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => handleAdd(g)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left"
                >
                  <span>{g.emoji}</span>
                  <span className="font-medium truncate">{g.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI suggest */}
      {allGroups.length > 0 && !suggestion && (
        <button
          type="button"
          onClick={handleSuggest}
          disabled={suggesting || pending}
          title="AI suggest group"
          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors disabled:opacity-50"
        >
          <Sparkles size={9} className={suggesting ? 'animate-pulse' : ''} />
          {suggesting ? 'Thinking…' : 'AI suggest'}
        </button>
      )}

      {/* AI suggestion chip */}
      {suggestion && (
        <div className="flex items-center gap-1 bg-violet-50 border border-violet-100 rounded-full px-2.5 py-1 text-[10px]">
          <Bot size={9} className="text-violet-500 shrink-0" />
          <span className="text-violet-700 font-semibold truncate max-w-[90px]" title={suggestion.reason}>
            {suggestion.group_name}
          </span>
          <button
            type="button"
            onClick={acceptSuggestion}
            disabled={pending || assignedIds.has(suggestion.group_id)}
            className="text-emerald-600 font-bold hover:text-emerald-700 disabled:opacity-40"
            title={assignedIds.has(suggestion.group_id) ? 'Already in this group' : 'Accept suggestion'}
          >
            <Check size={10} />
          </button>
          <button type="button" onClick={() => setSuggestion(null)} className="text-gray-400 hover:text-gray-600">
            <X size={9} />
          </button>
        </div>
      )}

      {error && (
        <span className="text-[10px] text-red-500 italic" title={error}>
          <AlertCircle size={9} className="inline mr-0.5" />{error.slice(0, 40)}
        </span>
      )}
    </div>
  );
}

// ─── Groups header bar for the Contacts tab ───────────────────────────────────
// Shows existing groups as filter pills + "New group" button that expands inline.

export function ContactsGroupBar({
  initialGroups,
  onGroupsChange,
}: {
  initialGroups:  GroupOption[];
  onGroupsChange: (groups: GroupOption[]) => void;
}) {
  const [groups,      setGroups]      = useState<GroupOption[]>(initialGroups);
  const [showCreate,  setShowCreate]  = useState(false);

  function handleCreated(g: GroupOption) {
    const next = [...groups, g];
    setGroups(next);
    onGroupsChange(next);
    setShowCreate(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Groups:</span>

        {groups.length === 0 && !showCreate && (
          <span className="text-xs text-gray-400 italic">No groups yet</span>
        )}

        {groups.map(g => (
          <span
            key={g.id}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1"
            style={{ backgroundColor: g.color + '18', color: g.color, border: `1px solid ${g.color}35` }}
          >
            {g.emoji} {g.name}
          </span>
        ))}

        <button
          type="button"
          onClick={() => setShowCreate(s => !s)}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition-colors"
        >
          <Plus size={10} />
          New group
        </button>
      </div>

      {showCreate && (
        <CreateGroupInline onCreated={handleCreated} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
