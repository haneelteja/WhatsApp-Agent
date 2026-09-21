'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, MapPin, Save, Loader2 } from 'lucide-react';
import { saveBranchesAction, type BranchInput } from '@/app/actions/whatsapp-numbers';

interface Props {
  numberId: string;
  initialBranches: BranchInput[];
}

const EMPTY_BRANCH: BranchInput = {
  name: '', address: '', access: '', hours: '', phone: '',
  manager_name: '', manager_phone: '', latitude: 0, longitude: 0,
};

export function BranchManagerEditor({ numberId, initialBranches }: Props) {
  const [branches, setBranches]   = useState<BranchInput[]>(initialBranches);
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(idx: number, field: keyof BranchInput, value: string | number) {
    setBranches(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
    setSaved(false);
  }

  function addBranch() {
    setBranches(prev => [...prev, { ...EMPTY_BRANCH }]);
    setExpanded(branches.length);
    setSaved(false);
  }

  function removeBranch(idx: number) {
    setBranches(prev => prev.filter((_, i) => i !== idx));
    setExpanded(null);
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveBranchesAction(numberId, branches);
      if ('error' in res) { setError(res.error); return; }
      setSaved(true);
    });
  }

  return (
    <div className="divide-y divide-slate-50">
      {branches.length === 0 && (
        <div className="px-5 py-6 text-center">
          <p className="text-xs text-slate-400">No branches configured yet. Add your first branch below.</p>
        </div>
      )}

      {branches.map((branch, idx) => (
        <div key={idx} className="divide-y divide-slate-50">
          {/* Branch header row */}
          <button
            type="button"
            onClick={() => setExpanded(expanded === idx ? null : idx)}
            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
              <MapPin size={13} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {branch.name || <span className="text-slate-400 italic">Untitled branch</span>}
              </p>
              {branch.manager_name && (
                <p className="text-xs text-slate-400 truncate">Manager: {branch.manager_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeBranch(idx); }}
                className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                title="Remove branch"
              >
                <Trash2 size={12} />
              </button>
              {expanded === idx ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </div>
          </button>

          {/* Expanded edit form */}
          {expanded === idx && (
            <div className="px-5 py-4 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Branch Name *" value={branch.name} onChange={v => update(idx, 'name', v)} placeholder="e.g. Banjara Hills Road 4" />
              <Field label="Address" value={branch.address} onChange={v => update(idx, 'address', v)} placeholder="Full address" />
              <Field label="Floor / Access / Parking" value={branch.access} onChange={v => update(idx, 'access', v)} placeholder="e.g. 2nd floor, lift access, mall parking" />
              <Field label="Opening Hours" value={branch.hours} onChange={v => update(idx, 'hours', v)} placeholder="e.g. 12:00 PM – 11:30 PM" />
              <Field label="Branch Phone" value={branch.phone} onChange={v => update(idx, 'phone', v)} placeholder="+91 98765 43210" />
              <div className="sm:col-span-2 border-t border-slate-200 pt-3 mt-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Branch Manager (for booking notifications)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Manager Name" value={branch.manager_name} onChange={v => update(idx, 'manager_name', v)} placeholder="e.g. Ravi Kumar" />
                  <Field label="Manager WhatsApp" value={branch.manager_phone} onChange={v => update(idx, 'manager_phone', v)} placeholder="+91 98765 43210" />
                </div>
              </div>
              <div className="sm:col-span-2 border-t border-slate-200 pt-3 mt-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">GPS Coordinates (for location pin matching)</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude" value={String(branch.latitude)} onChange={v => update(idx, 'latitude', parseFloat(v) || 0)} placeholder="17.4254" />
                  <Field label="Longitude" value={String(branch.longitude)} onChange={v => update(idx, 'longitude', parseFloat(v) || 0)} placeholder="78.4489" />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Footer: add + save */}
      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={addBranch}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          <Plus size={13} />
          Add branch
        </button>

        <div className="flex items-center gap-3">
          {error && <p className="text-xs text-red-500">{error}</p>}
          {saved && <p className="text-xs text-emerald-600 font-medium">Saved ✓</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || branches.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save branches
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors"
      />
    </div>
  );
}
