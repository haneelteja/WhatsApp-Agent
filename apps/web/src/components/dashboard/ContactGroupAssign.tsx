'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Bot, ChevronDown, Plus, X, Sparkles }        from 'lucide-react';
import { addContactToGroup, removeContactFromGroup, suggestGroupForContact } from '@/app/actions/contact-groups';

type GroupOption = { id: string; name: string; color: string; emoji: string };
type AssignedGroup = { group_id: string; name: string; color: string; emoji: string; added_by: string };

export function ContactGroupAssign({
  contactId,
  allGroups,
  assignedGroups,
}: {
  contactId:      string;
  allGroups:      GroupOption[];
  assignedGroups: AssignedGroup[];
}) {
  const [open,        setOpen]        = useState(false);
  const [assigned,    setAssigned]    = useState<AssignedGroup[]>(assignedGroups);
  const [suggesting,  setSuggesting]  = useState(false);
  const [suggestion,  setSuggestion]  = useState<{ group_id: string; group_name: string; reason: string } | null>(null);
  const [suggError,   setSuggError]   = useState<string | null>(null);
  const [pending,     startTransition] = useTransition();
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const assignedIds  = new Set(assigned.map(a => a.group_id));
  const unassigned   = allGroups.filter(g => !assignedIds.has(g.id));

  function handleAdd(group: GroupOption) {
    setOpen(false);
    startTransition(async () => {
      await addContactToGroup(contactId, group.id, 'manual');
      setAssigned(prev => [...prev, { group_id: group.id, name: group.name, color: group.color, emoji: group.emoji, added_by: 'manual' }]);
    });
  }

  function handleRemove(groupId: string) {
    startTransition(async () => {
      await removeContactFromGroup(contactId, groupId);
      setAssigned(prev => prev.filter(a => a.group_id !== groupId));
    });
  }

  async function handleAiSuggest() {
    setSuggesting(true);
    setSuggestion(null);
    setSuggError(null);
    const result = await suggestGroupForContact(contactId);
    setSuggesting(false);
    if (result.error) { setSuggError(result.error); return; }
    if (result.suggestion) setSuggestion(result.suggestion);
  }

  async function acceptSuggestion() {
    if (!suggestion) return;
    const group = allGroups.find(g => g.id === suggestion.group_id);
    if (!group) return;
    startTransition(async () => {
      await addContactToGroup(contactId, suggestion.group_id, 'ai', suggestion.reason);
      setAssigned(prev => [...prev, { group_id: group.id, name: group.name, color: group.color, emoji: group.emoji, added_by: 'ai' }]);
      setSuggestion(null);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
      {/* Assigned group pills */}
      {assigned.map(a => (
        <span
          key={a.group_id}
          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all group/pill"
          style={{ backgroundColor: a.color + '15', color: a.color, border: `1px solid ${a.color}30` }}
        >
          {a.emoji} {a.name}
          <button
            type="button"
            onClick={() => handleRemove(a.group_id)}
            disabled={pending}
            className="ml-0.5 opacity-0 group-hover/pill:opacity-100 transition-opacity"
          >
            <X size={9} />
          </button>
        </span>
      ))}

      {/* Add to group dropdown */}
      {allGroups.length > 0 && (
        <div ref={dropRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            disabled={pending || unassigned.length === 0}
            title={unassigned.length === 0 ? 'Already in all groups' : 'Add to group'}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors disabled:opacity-30"
          >
            <Plus size={9} />
            <ChevronDown size={9} />
          </button>

          {open && unassigned.length > 0 && (
            <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-100 rounded-xl shadow-lg z-20 py-1">
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

      {/* AI suggest button */}
      {allGroups.length > 0 && !suggestion && (
        <button
          type="button"
          onClick={handleAiSuggest}
          disabled={suggesting || pending}
          title="AI suggest group"
          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors disabled:opacity-50"
        >
          {suggesting ? (
            <span className="animate-pulse"><Sparkles size={9} /></span>
          ) : (
            <Sparkles size={9} />
          )}
          {suggesting ? 'Thinking…' : 'AI suggest'}
        </button>
      )}

      {/* AI suggestion */}
      {suggestion && (
        <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-100 rounded-full px-2.5 py-1 text-[10px]">
          <Bot size={9} className="text-violet-500 shrink-0" />
          <span className="text-violet-700 font-semibold truncate max-w-[100px]" title={suggestion.reason}>
            {suggestion.group_name}
          </span>
          <button
            type="button"
            onClick={acceptSuggestion}
            disabled={pending || assignedIds.has(suggestion.group_id)}
            className="text-emerald-600 font-bold hover:text-emerald-700 transition-colors disabled:opacity-40"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => setSuggestion(null)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={9} />
          </button>
        </div>
      )}

      {/* AI error */}
      {suggError && (
        <span className="text-[10px] text-red-500 italic max-w-[150px] truncate" title={suggError}>
          {suggError}
        </span>
      )}
    </div>
  );
}
