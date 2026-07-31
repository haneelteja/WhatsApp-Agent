'use client';

import { useState, useTransition, useRef } from 'react';
import { Mail, Pencil, Check, X } from 'lucide-react';
import { updateContactEmailAction } from '@/app/actions/platform';

export function ContactEmailEditor({
  tenantId,
  initialEmail,
}: {
  tenantId: string;
  initialEmail: string | null;
}) {
  const [editing, setEditing]   = useState(false);
  const [value, setValue]       = useState(initialEmail ?? '');
  const [saved, setSaved]       = useState(initialEmail ?? '');
  const [error, setError]       = useState<string | null>(null);
  const [isPending, start]      = useTransition();
  const inputRef                = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setValue(saved);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancel() {
    setEditing(false);
    setValue(saved);
    setError(null);
  }

  function save() {
    setError(null);
    start(async () => {
      const result = await updateContactEmailAction(tenantId, value);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(value);
        setEditing(false);
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <Mail size={12} className="text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          type="email"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isPending}
          className="text-xs border border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-52 disabled:opacity-50"
          placeholder="contact@company.com"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
          title="Save"
        >
          <Check size={13} />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="p-1 rounded-md text-slate-400 hover:bg-slate-100 disabled:opacity-50 transition-colors"
          title="Cancel"
        >
          <X size={13} />
        </button>
        {error && <span className="text-[10px] text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-1 group/email">
      <Mail size={12} className="text-slate-400 shrink-0" />
      {saved ? (
        <a
          href={`mailto:${saved}`}
          className="text-xs text-slate-500 hover:text-indigo-600 transition-colors"
        >
          {saved}
        </a>
      ) : (
        <span className="text-xs text-slate-300 italic">No email set</span>
      )}
      <button
        type="button"
        onClick={startEdit}
        className="p-0.5 rounded text-slate-300 hover:text-slate-500 opacity-0 group-hover/email:opacity-100 transition-all"
        title="Edit email"
      >
        <Pencil size={11} />
      </button>
    </div>
  );
}
