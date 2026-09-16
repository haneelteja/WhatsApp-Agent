'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronUp, ToggleLeft, ToggleRight } from 'lucide-react';
import { updateWhatsAppNumberAction, updateRoutingConfigAction } from '@/app/actions/whatsapp-numbers';

type ProductType = 'support_bot' | 'sales_bot' | 'lifecycle_bot' | 'appointment_bot';

const BOT_OPTIONS: { value: ProductType; label: string }[] = [
  { value: 'support_bot',     label: 'Support Bot' },
  { value: 'sales_bot',       label: 'Sales Bot' },
  { value: 'appointment_bot', label: 'Appointment Bot' },
  { value: 'lifecycle_bot',   label: 'Lifecycle Bot' },
];

const DEFAULT_MENU_LABELS: Record<string, string> = {
  support_bot:     'Customer Support',
  sales_bot:       'Products & Sales',
  appointment_bot: 'Book an Appointment',
  lifecycle_bot:   'My Orders & Account',
};

interface RoutingConfig {
  greeting?:             string;
  general_question?:     string;
  menu_intro?:           string;
  confidence_threshold?: number;
  menu_labels?:          Partial<Record<string, string>>;
}

interface EditableNumber {
  id:             string;
  phone_number:   string;
  provider:       string;
  label:          string | null;
  product_slug:   string | null;
  phone_number_id: string | null;
  routing_mode?:   'single' | 'multi';
  routing_config?: RoutingConfig;
}

interface Props {
  number:     EditableNumber;
  activeBots: string[];
  onClose:    () => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400';
const smallInputCls = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400';

export function EditWhatsAppNumberModal({ number, activeBots, onClose }: Props) {
  const [label, setLabel]           = useState(number.label ?? '');
  const [bot, setBot]               = useState<string>(number.product_slug ?? '');
  const [phoneNumberId, setPhoneId] = useState(number.phone_number_id ?? '');
  const [accessToken, setToken]     = useState('');
  const [contentSid, setContentSid] = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  // Routing config state
  const [routingMode, setRoutingMode] = useState<'single' | 'multi'>(
    number.routing_mode ?? 'single',
  );
  const [showRouting, setShowRouting] = useState(routingMode === 'multi');
  const rc = number.routing_config ?? {};
  const [greeting, setGreeting]     = useState(rc.greeting ?? '');
  const [generalQ, setGeneralQ]     = useState(rc.general_question ?? '');
  const [menuIntro, setMenuIntro]   = useState(rc.menu_intro ?? '');
  const [threshold, setThreshold]   = useState<string>(
    rc.confidence_threshold !== undefined ? String(rc.confidence_threshold) : '0.75',
  );
  const [menuLabels, setMenuLabels] = useState<Record<string, string>>(
    rc.menu_labels ? { ...DEFAULT_MENU_LABELS, ...(rc.menu_labels as Record<string, string>) }
                   : { ...DEFAULT_MENU_LABELS },
  );

  const isTwilio = number.provider === 'twilio';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    // Twilio credential handling
    let finalToken: string | undefined = accessToken || undefined;
    if (isTwilio && finalToken && contentSid.trim()) {
      finalToken = `${finalToken}|${contentSid.trim()}`;
    } else if (isTwilio && !finalToken && contentSid.trim()) {
      setError('Please re-enter Account SID:Auth Token when updating Content SID');
      setSaving(false);
      return;
    }

    // Save core number settings
    const result = await updateWhatsAppNumberAction(number.id, {
      label:         label || undefined,
      product_slug:  bot   || undefined,
      phoneNumberId: number.provider === 'meta_cloud' ? phoneNumberId || undefined : undefined,
      accessToken:   finalToken,
    });

    if ('error' in result) {
      setError(result.error);
      setSaving(false);
      return;
    }

    // Save routing config
    const thresholdNum = parseFloat(threshold);
    const routingResult = await updateRoutingConfigAction(number.id, {
      routing_mode:   routingMode,
      routing_config: {
        greeting:             greeting.trim() || undefined,
        general_question:     generalQ.trim() || undefined,
        menu_intro:           menuIntro.trim() || undefined,
        confidence_threshold: isNaN(thresholdNum) ? 0.75 : Math.min(1, Math.max(0, thresholdNum)),
        menu_labels:          Object.fromEntries(
          activeBots.map(b => [b, menuLabels[b] ?? DEFAULT_MENU_LABELS[b] ?? b]),
        ),
      },
    });

    setSaving(false);
    if ('error' in routingResult) {
      setError(routingResult.error);
      return;
    }

    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 p-6 space-y-4 border border-green-100">
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
          {/* Core fields */}
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

          <Field label={number.provider === 'meta_cloud' ? 'Access Token (leave blank to keep current)' : 'Account SID:Auth Token (leave blank to keep current)'}>
            <input
              type="password"
              value={accessToken}
              onChange={e => setToken(e.target.value)}
              placeholder={isTwilio ? 'ACxxxxxxxx:your_auth_token' : 'Paste new token to replace…'}
              className={inputCls}
            />
          </Field>

          {isTwilio && (
            <Field label="Content SID (required for WhatsApp replies)">
              <input
                value={contentSid}
                onChange={e => setContentSid(e.target.value)}
                placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className={inputCls}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Create a free-form template in Twilio → Messaging → Content Template Builder. Body: <code>{'{{1}}'}</code>. Copy the HX... SID here.
              </p>
            </Field>
          )}

          {/* ── Multi-bot Routing ─────────────────────────────────────── */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRouting(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">Multi-bot Routing</span>
                {routingMode === 'multi' && (
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              {showRouting ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>

            {showRouting && (
              <div className="p-4 space-y-4 bg-white">
                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-700">Enable multi-bot routing</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Route conversations to different bots based on customer intent</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRoutingMode(m => m === 'single' ? 'multi' : 'single')}
                    className="shrink-0"
                    aria-label="Toggle routing mode"
                  >
                    {routingMode === 'multi'
                      ? <ToggleRight size={28} className="text-emerald-600" />
                      : <ToggleLeft  size={28} className="text-slate-300" />}
                  </button>
                </div>

                {routingMode === 'multi' && (
                  <div className="space-y-3 pt-1 border-t border-slate-100">
                    <Field
                      label="Greeting message"
                      hint="Sent to first-time contacts before asking for their name"
                    >
                      <textarea
                        value={greeting}
                        onChange={e => setGreeting(e.target.value)}
                        placeholder="Hello! Welcome. I'm your virtual assistant."
                        rows={2}
                        className={smallInputCls + ' resize-none'}
                      />
                    </Field>

                    <Field
                      label="General question"
                      hint="Sent after saving the contact's name to prompt their intent"
                    >
                      <input
                        value={generalQ}
                        onChange={e => setGeneralQ(e.target.value)}
                        placeholder="How can I help you today?"
                        className={smallInputCls}
                      />
                    </Field>

                    <Field
                      label="Menu intro"
                      hint="Shown when intent is unclear and customer must pick from a menu"
                    >
                      <input
                        value={menuIntro}
                        onChange={e => setMenuIntro(e.target.value)}
                        placeholder="Please choose how I can help you:"
                        className={smallInputCls}
                      />
                    </Field>

                    <Field
                      label="Confidence threshold (0.0 – 1.0)"
                      hint="Intent must exceed this score to auto-route; below it shows the menu"
                    >
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={threshold}
                        onChange={e => setThreshold(e.target.value)}
                        className={smallInputCls}
                      />
                    </Field>

                    {/* Per-bot menu labels */}
                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-2">Menu labels per bot</p>
                      <div className="space-y-2">
                        {activeBots.map(b => (
                          <div key={b} className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500 w-32 shrink-0">
                              {BOT_OPTIONS.find(o => o.value === b)?.label ?? b}
                            </span>
                            <input
                              value={menuLabels[b] ?? DEFAULT_MENU_LABELS[b] ?? b}
                              onChange={e => setMenuLabels(prev => ({ ...prev, [b]: e.target.value }))}
                              placeholder={DEFAULT_MENU_LABELS[b] ?? b}
                              className={smallInputCls + ' text-xs'}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Customers type a number (1, 2…) or these labels to select a bot
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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
