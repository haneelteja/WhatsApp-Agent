'use client';

import { useState, useTransition } from 'react';
import { Phone, RotateCcw, Save } from 'lucide-react';
import { saveTenantVoiceConfigAction, resetVoiceUsageAction, type TenantVoiceConfigInput } from '@/app/actions/tenant-voice-config';

export interface TenantVoiceConfigRow {
  from_number:            string;
  max_calls_per_month:    number | null;
  max_minutes_per_month:  number | null;
  max_calls_per_day:      number | null;
  max_cost_inr_per_month: number | null;
  calls_this_month:       number;
  minutes_this_month:     number;
  cost_inr_this_month:    number;
  calls_today:            number;
}

function numOrNull(val: string): number | null {
  const n = parseInt(val, 10);
  return isNaN(n) || val.trim() === '' ? null : n;
}

function floatOrNull(val: string): number | null {
  const n = parseFloat(val);
  return isNaN(n) || val.trim() === '' ? null : n;
}

export function TenantVoiceConfigCard({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: TenantVoiceConfigRow | null;
}) {
  const [fromNumber,          setFromNumber]          = useState(initial?.from_number ?? '');
  const [maxCallsMonth,       setMaxCallsMonth]       = useState(initial?.max_calls_per_month?.toString() ?? '');
  const [maxMinutesMonth,     setMaxMinutesMonth]     = useState(initial?.max_minutes_per_month?.toString() ?? '');
  const [maxCallsDay,         setMaxCallsDay]         = useState(initial?.max_calls_per_day?.toString() ?? '');
  const [maxCostMonth,        setMaxCostMonth]        = useState(initial?.max_cost_inr_per_month?.toString() ?? '');

  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    const input: TenantVoiceConfigInput = {
      from_number:            fromNumber,
      max_calls_per_month:    numOrNull(maxCallsMonth),
      max_minutes_per_month:  numOrNull(maxMinutesMonth),
      max_calls_per_day:      numOrNull(maxCallsDay),
      max_cost_inr_per_month: floatOrNull(maxCostMonth),
    };
    startTransition(async () => {
      const result = await saveTenantVoiceConfigAction(tenantId, input);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  function handleResetUsage() {
    startTransition(async () => {
      await resetVoiceUsageAction(tenantId);
    });
  }

  const usage = initial ?? {
    calls_this_month: 0, minutes_this_month: 0, cost_inr_this_month: 0, calls_today: 0,
  };

  const usageItems = [
    { label: 'Calls this month', value: usage.calls_this_month.toString(),                        limit: maxCallsMonth },
    { label: 'Minutes this month', value: Number(usage.minutes_this_month).toFixed(1),             limit: maxMinutesMonth },
    { label: 'Cost this month (₹)', value: `₹${Number(usage.cost_inr_this_month).toFixed(2)}`,    limit: maxCostMonth ? `₹${maxCostMonth}` : null },
    { label: 'Calls today',  value: usage.calls_today.toString(),                                  limit: maxCallsDay },
  ];

  return (
    <div className="space-y-5">
      {/* From Number */}
      <div>
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
          Client&apos;s Caller ID (from_number)
        </label>
        <p className="text-xs text-slate-400 mb-2">
          The Exotel / Twilio number assigned to this client, in E.164 format (e.g. <code>+918040xxxxxx</code>).
          This overrides the platform-level number.
        </p>
        <input
          type="tel"
          value={fromNumber}
          onChange={e => setFromNumber(e.target.value)}
          placeholder="+91xxxxxxxxxx"
          className="w-full sm:w-72 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
        />
      </div>

      {/* Limits */}
      <div>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Usage Limits</p>
        <p className="text-xs text-slate-400 mb-3">Leave blank for unlimited.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Max calls / month', value: maxCallsMonth, set: setMaxCallsMonth, placeholder: 'e.g. 500' },
            { label: 'Max minutes / month', value: maxMinutesMonth, set: setMaxMinutesMonth, placeholder: 'e.g. 300' },
            { label: 'Max calls / day', value: maxCallsDay, set: setMaxCallsDay, placeholder: 'e.g. 50' },
            { label: 'Max cost ₹ / month', value: maxCostMonth, set: setMaxCostMonth, placeholder: 'e.g. 500' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">{f.label}</label>
              <input
                type="number"
                min={0}
                value={f.value}
                onChange={e => f.set(e.target.value)}
                placeholder={f.placeholder}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 tabular-nums"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Save size={13} />
          {isPending ? 'Saving…' : 'Save Voice Config'}
        </button>
        {saved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {/* Current usage */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Current Usage</p>
          <button
            type="button"
            onClick={handleResetUsage}
            disabled={isPending}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RotateCcw size={11} /> Reset counters
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {usageItems.map(u => {
            const hasLimit = u.limit !== null && u.limit !== undefined && u.limit !== '';
            return (
              <div key={u.label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <p className="text-lg font-bold tabular-nums text-slate-800">{u.value}</p>
                {hasLimit && (
                  <p className="text-[10px] text-slate-400">of {u.limit}</p>
                )}
                <p className="text-[11px] text-slate-500 mt-0.5">{u.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
