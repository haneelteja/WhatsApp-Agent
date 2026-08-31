'use client';

import { useState, useTransition } from 'react';
import { Phone, X, Loader2, ArrowLeftRight, User } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export interface VoiceNumberOption {
  id:         string;
  number:     string;
  label:      string;
  provider:   string;
  is_default: boolean;
}

interface Props {
  tenantId:             string;
  productSlug:          string;
  apiBase:              string;
  voiceNumbers?:        VoiceNumberOption[];   // Option A: virtual numbers to pick from
  bridgeModeEnabled?:   boolean;               // Option B: bridge/click-to-call feature flag
  defaultAgentNumber?:  string;                // Option B: pre-fill agent number from settings
}

export function MakeCallButton({
  tenantId,
  productSlug,
  apiBase,
  voiceNumbers        = [],
  bridgeModeEnabled   = false,
  defaultAgentNumber  = '',
}: Props) {
  const defaultFrom    = voiceNumbers.find(n => n.is_default)?.number ?? voiceNumbers[0]?.number ?? '';

  const [open,        setOpen]        = useState(false);
  const [toPhone,     setToPhone]     = useState('');
  const [name,        setName]        = useState('');
  const [fromNumber,  setFromNumber]  = useState(defaultFrom);
  const [bridgeMode,  setBridgeMode]  = useState(false);
  const [agentNumber, setAgentNumber] = useState(defaultAgentNumber);
  const [result,      setResult]      = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending,   startTransition] = useTransition();

  function handleOpen() {
    setOpen(true);
    setResult(null);
    setToPhone('');
    setName('');
    setFromNumber(defaultFrom);
    setBridgeMode(false);
    setAgentNumber(defaultAgentNumber);
  }
  function handleClose() { setOpen(false); setResult(null); }

  function normalize(n: string) {
    const t = n.trim();
    return t.startsWith('+') ? t : `+${t}`;
  }

  function handleDispatch() {
    const to = normalize(toPhone);
    if (!to || to.length < 8) return;
    if (bridgeMode) {
      const agent = normalize(agentNumber);
      if (!agent || agent.length < 8) return;
    }

    setResult(null);
    startTransition(async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';

      const body: Record<string, unknown> = {
        tenant_id:    tenantId,
        product_slug: productSlug,
        to_number:    to,
        triggered_by: bridgeMode ? 'bridge' : 'manual',
        call_context: {
          customer_name:  name.trim() || 'Customer',
          trigger_reason: bridgeMode ? 'Bridge call from dashboard' : 'Manual call from dashboard',
        },
      };

      if (fromNumber) body['from_number'] = fromNumber;
      if (bridgeMode && agentNumber) body['agent_number'] = normalize(agentNumber);

      try {
        const res = await fetch(`${apiBase}/api/voice/dispatch`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body:    JSON.stringify(body),
        });

        if (res.ok) {
          const data = await res.json() as { telephony_call_sid?: string };
          const sid  = data.telephony_call_sid ?? '—';
          setResult({
            ok:      true,
            message: bridgeMode
              ? `Calling your phone now. Answer to connect to the customer. (SID: ${sid})`
              : `Call initiated — SID: ${sid}`,
          });
          setToPhone('');
          setName('');
        } else {
          const err = await res.json() as { error?: string };
          setResult({ ok: false, message: err.error ?? `Error ${res.status}` });
        }
      } catch (e) {
        setResult({ ok: false, message: e instanceof Error ? e.message : 'Network error' });
      }
    });
  }

  const canDispatch = toPhone.trim().length >= 7
    && (!bridgeMode || agentNumber.trim().length >= 7)
    && !isPending;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-2 text-sm font-medium bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors"
      >
        <Phone size={14} />
        Make a Call
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Phone size={15} className="text-emerald-600" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">Dispatch a Call</h3>
              </div>
              <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            {/* From number — Option A */}
            {voiceNumbers.length > 1 && (
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">From (Caller ID)</label>
                <select
                  value={fromNumber}
                  onChange={e => setFromNumber(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono"
                >
                  {voiceNumbers.map(n => (
                    <option key={n.id} value={n.number}>
                      {n.number}{n.label ? ` — ${n.label}` : ''}{n.is_default ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {voiceNumbers.length === 1 && (
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                <Phone size={12} className="text-gray-400 shrink-0" />
                <span className="text-xs text-gray-500">Calling from <span className="font-mono font-medium text-gray-700">{voiceNumbers[0]!.number}</span></span>
              </div>
            )}

            {/* Customer phone + name */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Customer phone <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={toPhone}
                  onChange={e => setToPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  onKeyDown={e => e.key === 'Enter' && handleDispatch()}
                />
                <p className="text-[11px] text-gray-400 mt-1">Include country code, e.g. +91 for India</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Customer name <span className="text-gray-300">(optional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Rahul"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  onKeyDown={e => e.key === 'Enter' && handleDispatch()}
                />
              </div>
            </div>

            {/* Bridge mode toggle — Option B */}
            {bridgeModeEnabled && (
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <button
                  type="button"
                  onClick={() => setBridgeMode(v => !v)}
                  className={`flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                    bridgeMode
                      ? 'bg-violet-50 border-violet-200 text-violet-800'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <ArrowLeftRight size={14} className={bridgeMode ? 'text-violet-600' : 'text-gray-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">Bridge call (call me first)</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      System calls your phone → you answer → customer is connected
                    </p>
                  </div>
                  <div className={`w-8 h-4 rounded-full transition-colors shrink-0 ${bridgeMode ? 'bg-violet-500' : 'bg-gray-300'}`}>
                    <div className={`w-3 h-3 mt-0.5 rounded-full bg-white shadow transition-transform ${bridgeMode ? 'translate-x-4 ml-0.5' : 'ml-0.5'}`} />
                  </div>
                </button>

                {bridgeMode && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                      <User size={11} /> Your personal number <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="tel"
                      value={agentNumber}
                      onChange={e => setAgentNumber(e.target.value)}
                      placeholder="+91 99999 00000"
                      className="w-full text-sm border border-violet-200 rounded-xl px-3 py-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 bg-violet-50/40"
                      onKeyDown={e => e.key === 'Enter' && handleDispatch()}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      We will call this number first. When you pick up, you will hear the customer.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className={`text-xs px-3 py-2.5 rounded-xl border ${
                result.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {result.message}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 text-sm font-medium text-gray-500 border border-gray-200 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDispatch}
                disabled={!canDispatch}
                className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium text-white px-4 py-2.5 rounded-xl disabled:opacity-50 transition-colors ${
                  bridgeMode ? 'bg-violet-600 hover:bg-violet-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : bridgeMode ? <ArrowLeftRight size={14} /> : <Phone size={14} />
                }
                {isPending
                  ? 'Dispatching…'
                  : bridgeMode ? 'Bridge Call' : 'Call Now'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
