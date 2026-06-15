'use client';

import { useState } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { addTenantWhatsAppNumberAction } from '@/app/actions/tenant-products';

type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';

const BOT_OPTIONS: { value: ProductType; label: string }[] = [
  { value: 'support_bot',   label: 'Support Bot' },
  { value: 'sales_bot',     label: 'Sales Bot' },
  { value: 'lifecycle_bot', label: 'Lifecycle Bot' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button type="button" onClick={handleCopy} className="shrink-0 p-1.5 rounded-md hover:bg-emerald-100 text-emerald-600 transition-colors">
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 mb-1.5 block">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400';

interface Props {
  activeBots: ProductType[];
  onClose: () => void;
  webhookBase: string;
}

export function AddWhatsAppNumberModal({ activeBots, onClose, webhookBase }: Props) {
  const [provider, setProvider]     = useState<'meta_cloud' | 'interakt' | 'wati' | 'gupshup'>('meta_cloud');
  const [phone, setPhone]           = useState('');
  const [label, setLabel]           = useState('');
  const [bot, setBot]               = useState<ProductType>(activeBots[0] ?? 'support_bot');
  const [phoneNumberId, setPhoneId] = useState('');
  const [accessToken, setToken]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [done, setDone]             = useState<{ verifyToken: string; webhookUrl: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) { setError('Phone number is required'); return; }
    setSaving(true);
    setError('');

    const result = await addTenantWhatsAppNumberAction({
      provider,
      phoneNumber: phone,
      label,
      productSlug: bot,
      phoneNumberId: provider === 'meta_cloud' ? phoneNumberId : undefined,
      accessToken,
    });

    setSaving(false);

    if ('error' in result) {
      setError(result.error ?? 'Unknown error');
      return;
    }

    setDone({
      verifyToken: result.verifyToken ?? '',
      webhookUrl: `${webhookBase}/${bot}`,
    });
  }

  if (done) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 border border-green-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Number Added — Configure Webhook</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-emerald-800 mb-0.5">Your WhatsApp number was saved successfully.</p>
            <p className="text-xs text-emerald-700">Now configure the webhook in Meta Developer Console:</p>
          </div>

          {/* Instructions */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3.5">
            <p className="text-xs font-semibold text-indigo-800 mb-2 flex items-center gap-1.5">
              <ExternalLink size={12} />
              Meta Developer Console Steps
            </p>
            <ol className="text-xs text-indigo-700 space-y-1.5 list-none">
              {[
                'Go to developers.facebook.com → Your App → WhatsApp → Configuration',
                'Under "Webhook", click Edit and paste the Callback URL below',
                'Paste the Verify Token exactly as shown and click Verify & Save',
                'Under "Webhook fields", subscribe to the messages field',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {[
            { label: 'Callback URL (Webhook)', value: done.webhookUrl },
            { label: 'Verify Token', value: done.verifyToken },
          ].map(({ label: l, value }) => (
            <div key={l} className="space-y-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{l}</p>
              <div className="flex items-center gap-2 bg-emerald-50 rounded-lg border border-emerald-100 px-3 py-2">
                <code className="flex-1 text-xs text-emerald-700 font-mono break-all">{value}</code>
                <CopyButton text={value} />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={onClose}
            className="w-full text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 border border-green-100">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Add WhatsApp Number</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <Field label="Provider" required>
            <select
              aria-label="Provider"
              value={provider}
              onChange={e => setProvider(e.target.value as typeof provider)}
              className={inputCls}
            >
              <option value="meta_cloud">Meta Cloud API</option>
              <option value="interakt">Interakt</option>
              <option value="wati">WATI</option>
              <option value="gupshup">Gupshup</option>
            </select>
          </Field>

          <Field label="Phone Number (with country code)" required>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+919666526666"
              className={inputCls}
            />
          </Field>

          <Field label="Label">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Elma Sales Line"
              className={inputCls}
            />
          </Field>

          <Field label="Assign to Bot" required>
            <select
              aria-label="Assign to Bot"
              value={bot}
              onChange={e => setBot(e.target.value as ProductType)}
              className={inputCls}
            >
              {BOT_OPTIONS.map(o => (
                <option key={o.value} value={o.value} disabled={!activeBots.includes(o.value)}>
                  {o.label}{!activeBots.includes(o.value) ? ' (not activated)' : ''}
                </option>
              ))}
            </select>
          </Field>

          {provider === 'meta_cloud' && (
            <Field label="Phone Number ID" required>
              <input
                value={phoneNumberId}
                onChange={e => setPhoneId(e.target.value)}
                placeholder="123456789012345"
                className={inputCls}
              />
            </Field>
          )}

          <Field label={provider === 'meta_cloud' ? 'Permanent Access Token' : 'API Key / Access Token'} required>
            <input
              type="password"
              value={accessToken}
              onChange={e => setToken(e.target.value)}
              placeholder="EAAxxxxxxxxx…"
              className={inputCls}
            />
          </Field>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2.5 rounded-xl border border-green-200 text-slate-600 hover:bg-green-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-sm px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 shadow-sm"
            >
              {saving ? 'Saving…' : 'Add Number'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
