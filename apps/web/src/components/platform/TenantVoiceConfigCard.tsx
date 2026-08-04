'use client';

import { useState, useTransition } from 'react';
import { Phone, RotateCcw, Save, RefreshCw, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import {
  saveTenantVoiceConfigAction,
  saveTenantExotelCredsAction,
  resetVoiceUsageAction,
  fetchExotelNumbersAction,
  type TenantVoiceConfigInput,
} from '@/app/actions/tenant-voice-config';

export interface TenantVoiceConfigRow {
  from_number:             string;
  exotel_api_key:          string | null;
  exotel_api_token:        string | null;
  exotel_account_sid:      string | null;
  max_calls_per_month:     number | null;
  max_minutes_per_month:   number | null;
  max_calls_per_day:       number | null;
  max_cost_inr_per_month:  number | null;
  calls_this_month:        number;
  minutes_this_month:      number;
  cost_inr_this_month:     number;
  calls_today:             number;
}

function numOrNull(val: string): number | null {
  const n = parseInt(val, 10);
  return isNaN(n) || val.trim() === '' ? null : n;
}

function floatOrNull(val: string): number | null {
  const n = parseFloat(val);
  return isNaN(n) || val.trim() === '' ? null : n;
}

function maskSecret(val: string | null): string {
  if (!val || val.length < 4) return val ?? '';
  return '••••••••' + val.slice(-4);
}

export function TenantVoiceConfigCard({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial:  TenantVoiceConfigRow | null;
}) {
  // ── Exotel credentials state ──────────────────────────────────────────────
  const hasExistingCreds = !!(initial?.exotel_api_key);
  const [editCreds,    setEditCreds]    = useState(!hasExistingCreds);
  const [apiKey,       setApiKey]       = useState('');
  const [apiToken,     setApiToken]     = useState('');
  const [accountSid,   setAccountSid]   = useState(initial?.exotel_account_sid ?? '');
  const [showApiKey,   setShowApiKey]   = useState(false);
  const [showApiToken, setShowApiToken] = useState(false);
  const [credsSaved,   setCredsSaved]   = useState(false);
  const [credsError,   setCredsError]   = useState<string | null>(null);

  // ── From number / numbers dropdown state ──────────────────────────────────
  const [fromNumber,    setFromNumber]    = useState(initial?.from_number ?? '');
  const [numbers,       setNumbers]       = useState<{ phone_number: string; friendly_name: string }[]>([]);
  const [fetchedNums,   setFetchedNums]   = useState(false);
  const [numsError,     setNumsError]     = useState<string | null>(null);

  // ── Limits state ──────────────────────────────────────────────────────────
  const [maxCallsMonth,   setMaxCallsMonth]   = useState(initial?.max_calls_per_month?.toString()    ?? '');
  const [maxMinutesMonth, setMaxMinutesMonth] = useState(initial?.max_minutes_per_month?.toString()  ?? '');
  const [maxCallsDay,     setMaxCallsDay]     = useState(initial?.max_calls_per_day?.toString()      ?? '');
  const [maxCostMonth,    setMaxCostMonth]    = useState(initial?.max_cost_inr_per_month?.toString() ?? '');

  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Save Exotel credentials ───────────────────────────────────────────────
  function handleSaveCreds() {
    setCredsError(null);
    setCredsSaved(false);
    startTransition(async () => {
      const result = await saveTenantExotelCredsAction(tenantId, {
        api_key:     apiKey,
        api_token:   apiToken,
        account_sid: accountSid,
      });
      if (result.error) {
        setCredsError(result.error);
      } else {
        setCredsSaved(true);
        setEditCreds(false);
        setApiKey('');
        setApiToken('');
      }
    });
  }

  // ── Fetch numbers from Exotel API ─────────────────────────────────────────
  function handleFetchNumbers() {
    setNumsError(null);
    startTransition(async () => {
      const result = await fetchExotelNumbersAction(tenantId);
      if (result.error) {
        setNumsError(result.error);
      } else {
        setNumbers(result.numbers);
        setFetchedNums(true);
        if (result.numbers.length === 1) setFromNumber(result.numbers[0]!.phone_number);
      }
    });
  }

  // ── Save limits + from_number ─────────────────────────────────────────────
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
      if (result.error) setError(result.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    });
  }

  // ── Reset usage counters ──────────────────────────────────────────────────
  function handleResetUsage() {
    startTransition(async () => { await resetVoiceUsageAction(tenantId); });
  }

  const usage = initial ?? {
    calls_this_month: 0, minutes_this_month: 0, cost_inr_this_month: 0, calls_today: 0,
  };

  const usageItems = [
    { label: 'Calls this month',    value: usage.calls_this_month.toString(),                     limit: maxCallsMonth   || null },
    { label: 'Minutes this month',  value: Number(usage.minutes_this_month).toFixed(1),            limit: maxMinutesMonth || null },
    { label: 'Cost this month (₹)', value: `₹${Number(usage.cost_inr_this_month).toFixed(2)}`,    limit: maxCostMonth ? `₹${maxCostMonth}` : null },
    { label: 'Calls today',         value: usage.calls_today.toString(),                           limit: maxCallsDay     || null },
  ];

  return (
    <div className="space-y-6">

      {/* ── Exotel Credentials ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Exotel Account</p>
          {hasExistingCreds && !editCreds && (
            <button
              type="button"
              onClick={() => setEditCreds(true)}
              className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium"
            >
              Change credentials
            </button>
          )}
        </div>

        {!editCreds && hasExistingCreds ? (
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
            <span>Exotel credentials configured</span>
            <span className="text-[11px] text-slate-400 ml-1">
              key ending ···{initial?.exotel_api_key?.slice(-4)} · SID: {initial?.exotel_account_sid}
            </span>
          </div>
        ) : (
          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">
              Enter this client&apos;s Exotel API credentials. Their bot will use these exclusively — completely
              isolated from the platform account.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* API Key */}
              <div>
                <label className="text-[11px] font-medium text-slate-500 block mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="exo_key_…"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                  />
                  <button type="button" onClick={() => setShowApiKey(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              {/* API Token */}
              <div>
                <label className="text-[11px] font-medium text-slate-500 block mb-1">API Token</label>
                <div className="relative">
                  <input
                    type={showApiToken ? 'text' : 'password'}
                    value={apiToken}
                    onChange={e => setApiToken(e.target.value)}
                    placeholder="token…"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                  />
                  <button type="button" onClick={() => setShowApiToken(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showApiToken ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              {/* Account SID */}
              <div>
                <label className="text-[11px] font-medium text-slate-500 block mb-1">Account SID</label>
                <input
                  type="text"
                  value={accountSid}
                  onChange={e => setAccountSid(e.target.value)}
                  placeholder="exotest123"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveCreds}
                disabled={isPending || !apiKey || !apiToken || !accountSid}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Save size={12} />
                {isPending ? 'Saving…' : 'Save Credentials'}
              </button>
              {hasExistingCreds && (
                <button type="button" onClick={() => setEditCreds(false)}
                  className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
              )}
              {credsSaved && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
              {credsError && <span className="text-xs text-red-600">{credsError}</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Caller ID (from_number) ────────────────────────────────────────── */}
      <div>
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block mb-1.5">
          Caller ID (from_number)
        </label>
        <p className="text-xs text-slate-400 mb-2">
          The virtual number this client&apos;s Exotel account will call from. Fetch from Exotel to see valid options.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {fetchedNums && numbers.length > 0 ? (
            <select
              value={fromNumber}
              onChange={e => setFromNumber(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono bg-white min-w-[220px]"
            >
              <option value="">— select a number —</option>
              {numbers.map(n => (
                <option key={n.phone_number} value={n.phone_number}>
                  {n.phone_number}{n.friendly_name !== n.phone_number ? ` (${n.friendly_name})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="tel"
              value={fromNumber}
              onChange={e => setFromNumber(e.target.value)}
              placeholder="+91xxxxxxxxxx"
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono w-52"
            />
          )}
          <button
            type="button"
            onClick={handleFetchNumbers}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={isPending ? 'animate-spin' : ''} />
            Fetch from Exotel
          </button>
          {numsError && <p className="text-xs text-red-600 w-full">{numsError}</p>}
        </div>
      </div>

      {/* ── Limits ────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Usage Limits</p>
        <p className="text-xs text-slate-400 mb-3">Leave blank for unlimited.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Max calls / month',   value: maxCallsMonth,   set: setMaxCallsMonth,   placeholder: 'e.g. 500' },
            { label: 'Max minutes / month', value: maxMinutesMonth, set: setMaxMinutesMonth, placeholder: 'e.g. 300' },
            { label: 'Max calls / day',     value: maxCallsDay,     set: setMaxCallsDay,     placeholder: 'e.g. 50'  },
            { label: 'Max cost ₹ / month',  value: maxCostMonth,    set: setMaxCostMonth,    placeholder: 'e.g. 500' },
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

      {/* ── Save button ───────────────────────────────────────────────────── */}
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

      {/* ── Current usage ─────────────────────────────────────────────────── */}
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
          {usageItems.map(u => (
            <div key={u.label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
              <p className="text-lg font-bold tabular-nums text-slate-800">{u.value}</p>
              {u.limit && <p className="text-[10px] text-slate-400">of {u.limit}</p>}
              <p className="text-[11px] text-slate-500 mt-0.5">{u.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
