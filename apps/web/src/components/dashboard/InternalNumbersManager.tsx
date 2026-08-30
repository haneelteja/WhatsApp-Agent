'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, Phone, ShieldOff } from 'lucide-react';
import { addInternalNumber, removeInternalNumber } from '@/app/actions/internal-numbers';
import type { InternalNumber } from '@/app/actions/internal-numbers';

export function InternalNumbersManager({
  initialNumbers,
}: {
  initialNumbers: InternalNumber[];
}) {
  const [numbers, setNumbers]   = useState<InternalNumber[]>(initialNumbers);
  const [phone, setPhone]       = useState('');
  const [label, setLabel]       = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const res = await addInternalNumber(phone, label);
      if (res.error) { setError(res.error); return; }
      setNumbers(prev => [...prev, res.number!]);
      setPhone('');
      setLabel('');
    });
  }

  function handleRemove(id: string) {
    const prev = numbers;
    setNumbers(cur => cur.filter(n => n.id !== id));
    startTransition(async () => {
      const res = await removeInternalNumber(id);
      if (res.error) setNumbers(prev);
    });
  }

  return (
    <div className="divide-y divide-slate-50">
      {/* Explanation */}
      <div className="px-5 py-4 flex items-start gap-3 bg-amber-50">
        <ShieldOff size={14} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 leading-relaxed">
          Messages from these numbers are <strong>silently ignored</strong> — the bot will not reply or create a lead. Use this for your own team&apos;s WhatsApp numbers so internal tests don&apos;t pollute your leads.
        </p>
      </div>

      {/* Existing numbers */}
      {numbers.length > 0 && (
        <div className="divide-y divide-slate-50">
          {numbers.map(n => (
            <div key={n.id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <Phone size={13} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 font-mono">{n.phone}</p>
                {n.label && <p className="text-xs text-slate-400 truncate">{n.label}</p>}
              </div>
              <button
                onClick={() => handleRemove(n.id)}
                disabled={isPending}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {numbers.length === 0 && (
        <div className="px-5 py-6 text-center">
          <p className="text-xs text-slate-400">No internal numbers added yet.</p>
        </div>
      )}

      {/* Add form */}
      <div className="px-5 py-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+919876543210"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-mono"
          />
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Label (e.g. CEO)"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !phone.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors shrink-0"
          >
            <Plus size={13} />
            Add
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
