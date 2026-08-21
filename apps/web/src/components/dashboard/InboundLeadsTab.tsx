'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, RefreshCw, Check, Loader2, AlertTriangle, Link2 } from 'lucide-react';
import { generateInboundWebhookKeyAction } from '@/app/actions/inbound';

const PAYLOAD_EXAMPLE = `{
  "phone": "+919876543210",
  "name":  "Ravi Kumar",
  "notes": "Interested in 5HP pump, budget 40k",
  "source": "zapier"
}`;

export function InboundLeadsTab({ initialKey }: { initialKey: string | null }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'https://your-api.onrender.com';

  const [webhookKey, setWebhookKey] = useState<string | null>(initialKey);
  const [showKey,    setShowKey]    = useState(false);
  const [copied,     setCopied]     = useState<'url' | 'key' | 'payload' | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const webhookUrl = webhookKey
    ? `${apiBase}/api/inbound/leads?key=${webhookKey}`
    : null;

  async function copyText(text: string, which: 'url' | 'key' | 'payload') {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleGenerate() {
    if (webhookKey && !confirmRegen) {
      setConfirmRegen(true);
      return;
    }
    setConfirmRegen(false);
    setGenerating(true);
    setError(null);
    const result = await generateInboundWebhookKeyAction();
    setGenerating(false);
    if (result.error) { setError(result.error); return; }
    setWebhookKey(result.key);
    setShowKey(true);
  }

  const maskedKey = webhookKey
    ? webhookKey.slice(0, 8) + '••••••••••••••••••••••••••••' + webhookKey.slice(-4)
    : null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Connect Zapier, Make.com, or any external CRM to push leads directly into the sales pipeline.
        Each inbound lead creates an escalated conversation ready for your team to claim.
      </p>

      {/* How it works */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-semibold text-emerald-800">How it works</p>
        <ul className="list-disc ml-4 space-y-1 text-xs text-emerald-700">
          <li>Generate an API key below and paste it into your Zapier / Make webhook action</li>
          <li>POST a JSON payload to the webhook URL with the customer&apos;s phone and optional details</li>
          <li>The lead appears instantly in the <strong>Leads</strong> tab — escalated and ready to claim</li>
          <li>Duplicate phone numbers within active conversations are deduplicated automatically</li>
        </ul>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
          <AlertTriangle size={13} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Key section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">

        {/* Webhook URL */}
        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <Link2 size={11} /> Webhook URL
          </p>
          {webhookUrl ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 overflow-x-auto whitespace-nowrap">
                {webhookUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyText(webhookUrl, 'url')}
                className="shrink-0 p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors"
                title="Copy URL"
              >
                {copied === 'url' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Generate an API key to get your webhook URL.</p>
          )}
        </div>

        {/* API Key */}
        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-600">API Key</p>
          {webhookKey ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 overflow-x-auto whitespace-nowrap">
                {showKey ? webhookKey : maskedKey}
              </code>
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="shrink-0 p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                type="button"
                onClick={() => void copyText(webhookKey, 'key')}
                className="shrink-0 p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors"
                title="Copy key"
              >
                {copied === 'key' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No key generated yet.</p>
          )}
        </div>

        {/* Generate / Regenerate button */}
        <div className="p-4">
          {confirmRegen ? (
            <div className="flex items-center gap-3">
              <p className="text-xs text-amber-700 font-medium">
                Regenerating will break any existing Zapier / Make connections. Continue?
              </p>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
              >
                Yes, regenerate
              </button>
              <button
                type="button"
                onClick={() => setConfirmRegen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {generating
                ? <Loader2 size={13} className="animate-spin" />
                : <RefreshCw size={13} />
              }
              {webhookKey ? 'Regenerate key' : 'Generate API key'}
            </button>
          )}
        </div>
      </div>

      {/* Payload schema */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-700">Expected JSON payload</p>
          <button
            type="button"
            onClick={() => void copyText(PAYLOAD_EXAMPLE, 'payload')}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-600 transition-colors"
          >
            {copied === 'payload' ? <Check size={11} /> : <Copy size={11} />}
            Copy
          </button>
        </div>
        <pre className="text-[11px] font-mono text-slate-700 bg-slate-50 px-4 py-3 overflow-x-auto leading-relaxed">
          {PAYLOAD_EXAMPLE}
        </pre>
        <div className="px-4 py-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {[
            { field: 'phone',  req: true,  desc: 'Customer phone in E.164 format (+91…)' },
            { field: 'name',   req: false, desc: 'Customer name (optional)' },
            { field: 'notes',  req: false, desc: 'Lead context stored as a message note' },
            { field: 'source', req: false, desc: '"zapier", "make", "facebook", etc.' },
          ].map(({ field, req, desc }) => (
            <div key={field} className="flex items-start gap-2">
              <code className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded shrink-0">
                {field}
              </code>
              {req && (
                <span className="text-[9px] font-bold text-red-500 mt-0.5 shrink-0">req</span>
              )}
              <span className="text-[11px] text-slate-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Method + response */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-700">Response codes</p>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          {[
            { code: '201', label: 'Lead created',      color: 'text-emerald-700 bg-emerald-50' },
            { code: '200', label: 'Duplicate skipped', color: 'text-sky-700 bg-sky-50'         },
            { code: '400', label: 'Missing phone',     color: 'text-amber-700 bg-amber-50'     },
            { code: '401', label: 'Invalid API key',   color: 'text-red-700 bg-red-50'         },
          ].map(({ code, label, color }) => (
            <div key={code} className="flex items-center gap-3">
              <code className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${color}`}>{code}</code>
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
