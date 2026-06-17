'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { updateWhatsAppNumberAction } from '@/app/actions/whatsapp-numbers';

type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot';

const BOT_OPTIONS: { value: ProductType; label: string }[] = [
  { value: 'support_bot',   label: 'Support Bot' },
  { value: 'sales_bot',     label: 'Sales Bot' },
  { value: 'lifecycle_bot', label: 'Lifecycle Bot' },
];

interface EditableNumber {
  id: string;
  phone_number: string;
  provider: string;
  label: string | null;
  product_slug: string | null;
  phone_number_id: string | null;
}

interface Props {
  number: EditableNumber;
  activeBots: ProductType[];
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400';

export function EditWhatsAppNumberModal({ number, activeBots, onClose }: Props) {
  const [label, setLabel]           = useState(number.label ?? '');
  const [bot, setBot]               = useState<string>(number.product_slug ?? '');
  const [phoneNumberId, setPhoneId] = useState(number.phone_number_id ?? '');
  const [accessToken, setToken]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const result = await updateWhatsAppNumberAction(number.id, {
      label:         label || undefined,
      product_slug:  bot   || undefined,
      phoneNumberId: number.provider === 'meta_cloud' ? phoneNumberId || undefined : undefined,
      accessToken:   accessToken || undefined,
    });

    setSaving(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }

    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 border border-green-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Edit WhatsApp Number</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{number.phone_number}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <Field label="Label">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Elma Sales Line"
              className={inputCls}
            />
          </Field>

          <Field label="Assign to Bot">
            <select
              aria-label="Assign to Bot"
              value={bot}
              onChange={e => setBot(e.target.value)}
              className={inputCls}
            >
              <option value="">Unassigned</option>
              {BOT_OPTIONS.map(o => (
                <option key={o.value} value={o.value} disabled={!activeBots.includes(o.value)}>
                  {o.label}{!activeBots.includes(o.value) ? ' (not activated)' : ''}
                </option>
              ))}
            </select>
          </Field>

          {number.provider === 'meta_cloud' && (
            <Field label="Phone Number ID">
              <input
                value={phoneNumberId}
                onChange={e => setPhoneId(e.target.value)}
                placeholder="123456789012345"
                className={inputCls}
              />
            </Field>
          )}

          <Field label={number.provider === 'meta_cloud' ? 'Access Token (leave blank to keep current)' : 'API Key (leave blank to keep current)'}>
            <input
              type="password"
              value={accessToken}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste new token to replace…"
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
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
