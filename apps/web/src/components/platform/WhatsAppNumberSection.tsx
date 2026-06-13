'use client';

import { useState, useTransition } from 'react';
import { Phone, Plus, Edit2, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { upsertWhatsAppNumberAction, type WaProvider } from '@/app/actions/whatsapp-numbers';

const BOT_META: Record<string, { name: string; color: string; bg: string; border: string }> = {
  support_bot:   { name: 'Support Bot',   color: 'text-sky-600',    bg: 'bg-sky-50',    border: 'border-sky-200'    },
  sales_bot:     { name: 'Sales Bot',     color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  lifecycle_bot: { name: 'Lifecycle Bot', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
};

const PROVIDERS: { value: WaProvider; label: string }[] = [
  { value: 'meta_cloud', label: 'Meta Cloud API' },
  { value: 'interakt',   label: 'Interakt'       },
  { value: 'wati',       label: 'WATI'           },
  { value: 'gupshup',   label: 'Gupshup'        },
];

interface WaNumber {
  id:           string;
  phone_number: string;
  provider:     string;
  label:        string | null;
  config_json:  Record<string, string>;
  product_slug: string | null;
}

interface Props {
  tenantId:   string;
  activeBots: { product_type: string }[];
  waNumbers:  WaNumber[];
}

function NumberForm({
  tenantId,
  productSlug,
  existing,
  onDone,
}: {
  tenantId:    string;
  productSlug: string;
  existing:    WaNumber | null;
  onDone:      () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error,   setError]        = useState<string | null>(null);
  const [saved,   setSaved]        = useState(false);

  const [provider,     setProvider]     = useState<WaProvider>((existing?.provider as WaProvider) ?? 'meta_cloud');
  const [phoneNumber,  setPhoneNumber]  = useState(existing?.phone_number ?? '');
  const [label,        setLabel]        = useState(existing?.label ?? '');
  const [phoneNumId,   setPhoneNumId]   = useState(existing?.config_json?.phone_number_id ?? '');
  const [accessToken,  setAccessToken]  = useState(existing?.config_json?.access_token ?? '');
  const [verifyToken,  setVerifyToken]  = useState(existing?.config_json?.verify_token ?? '');
  const [apiKey,       setApiKey]       = useState(existing?.config_json?.api_key ?? '');
  const [apiEndpoint,  setApiEndpoint]  = useState(existing?.config_json?.api_endpoint ?? '');
  const [appName,      setAppName]      = useState(existing?.config_json?.app_name ?? '');

  function buildConfigJson(): Record<string, string> {
    if (provider === 'meta_cloud') return { phone_number_id: phoneNumId, access_token: accessToken, verify_token: verifyToken };
    if (provider === 'interakt')   return { api_key: apiKey };
    if (provider === 'wati')       return { api_endpoint: apiEndpoint, api_token: apiKey };
    if (provider === 'gupshup')    return { api_key: apiKey, app_name: appName };
    return {};
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await upsertWhatsAppNumberAction(tenantId, productSlug, {
        phone_number: phoneNumber,
        provider,
        label,
        config_json: buildConfigJson(),
      });
      if ('error' in res) {
        setError(res.error);
      } else {
        setSaved(true);
        setTimeout(() => { setSaved(false); onDone(); }, 1200);
      }
    });
  }

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Provider</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value as WaProvider)}
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Display Label</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. India Support Line"
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Phone Number</label>
        <input
          type="text"
          value={phoneNumber}
          onChange={e => setPhoneNumber(e.target.value)}
          placeholder="+91 9999999999"
          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
        />
      </div>

      {provider === 'meta_cloud' && (
        <div className="space-y-2.5">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Phone Number ID</label>
            <input type="text" value={phoneNumId} onChange={e => setPhoneNumId(e.target.value)} placeholder="From Meta Business dashboard" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Access Token</label>
            <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Permanent access token" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Verify Token</label>
            <input type="text" value={verifyToken} onChange={e => setVerifyToken(e.target.value)} placeholder="Your chosen webhook verify token" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
          </div>
        </div>
      )}

      {provider === 'interakt' && (
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">API Key</label>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Interakt API key" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
        </div>
      )}

      {provider === 'wati' && (
        <div className="space-y-2.5">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">API Endpoint</label>
            <input type="text" value={apiEndpoint} onChange={e => setApiEndpoint(e.target.value)} placeholder="https://live-server.wati.io" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">API Token</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="WATI API token" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
          </div>
        </div>
      )}

      {provider === 'gupshup' && (
        <div className="space-y-2.5">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">API Key</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Gupshup API key" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">App Name</label>
            <input type="text" value={appName} onChange={e => setAppName(e.target.value)} placeholder="Gupshup app name" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !phoneNumber}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Check size={12} />
          {pending ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function WhatsAppNumberSection({ tenantId, activeBots, waNumbers }: Props) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const numberBySlug = new Map<string, WaNumber>(
    waNumbers.filter(n => n.product_slug).map(n => [n.product_slug!, n])
  );

  return (
    <div className="divide-y divide-slate-100">
      {activeBots.map(bot => {
        const meta    = BOT_META[bot.product_type];
        if (!meta) return null;
        const num     = numberBySlug.get(bot.product_type) ?? null;
        const isOpen  = openSlug === bot.product_type;

        return (
          <div key={bot.product_type} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg} border ${meta.border}`}>
                <Phone size={13} className={meta.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${meta.color}`}>{meta.name}</p>
                {num ? (
                  <p className="text-xs text-slate-500 font-mono truncate">
                    {num.label ? `${num.label} · ` : ''}{num.phone_number}
                    <span className="ml-2 text-[10px] text-slate-400 font-sans capitalize">{num.provider.replace('_', ' ')}</span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">Not configured</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpenSlug(isOpen ? null : bot.product_type)}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0"
              >
                {num ? (
                  <><Edit2 size={11} /> {isOpen ? 'Cancel' : 'Edit'}</>
                ) : (
                  <><Plus size={11} /> Add</>
                )}
                {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            </div>

            {isOpen && (
              <NumberForm
                tenantId={tenantId}
                productSlug={bot.product_type}
                existing={num}
                onDone={() => setOpenSlug(null)}
              />
            )}
          </div>
        );
      })}

      {activeBots.length === 0 && (
        <p className="text-xs text-slate-400 py-4">No active bots — assign products above first.</p>
      )}
    </div>
  );
}
