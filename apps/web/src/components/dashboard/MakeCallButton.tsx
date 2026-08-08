'use client';

import { useState, useTransition } from 'react';
import { Phone, X, Loader2 } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  tenantId:    string;
  productSlug: string;
  apiBase:     string;
}

export function MakeCallButton({ tenantId, productSlug, apiBase }: Props) {
  const [open,      setOpen]      = useState(false);
  const [phone,     setPhone]     = useState('');
  const [name,      setName]      = useState('');
  const [result,    setResult]    = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() { setOpen(true); setResult(null); setPhone(''); setName(''); }
  function handleClose() { setOpen(false); setResult(null); }

  function handleDispatch() {
    const normalized = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;
    if (!normalized || normalized.length < 8) return;

    setResult(null);
    startTransition(async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';

      try {
        const res = await fetch(`${apiBase}/api/voice/dispatch`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            tenant_id:    tenantId,
            product_slug: productSlug,
            to_number:    normalized,
            triggered_by: 'manual',
            call_context: {
              customer_name:  name.trim() || 'Customer',
              trigger_reason: 'Manual call from dashboard',
            },
          }),
        });

        if (res.ok) {
          const data = await res.json() as { telephony_call_sid?: string };
          setResult({ ok: true, message: `Call initiated — SID: ${data.telephony_call_sid ?? '—'}` });
          setPhone('');
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

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
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

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Phone number <span className="text-red-400">*</span></label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  onKeyDown={e => e.key === 'Enter' && handleDispatch()}
                />
                <p className="text-[11px] text-gray-400 mt-1">Include country code, e.g. +91 for India</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Customer name <span className="text-gray-300">(optional)</span></label>
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

            {result && (
              <div className={`text-xs px-3 py-2.5 rounded-xl border ${
                result.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {result.message}
              </div>
            )}

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
                disabled={isPending || !phone.trim()}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium bg-emerald-600 text-white px-4 py-2.5 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
                {isPending ? 'Calling…' : 'Call Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
