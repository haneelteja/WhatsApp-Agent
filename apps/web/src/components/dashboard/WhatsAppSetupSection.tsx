'use client';

import { useState } from 'react';
import { Copy, Check, Link2, ExternalLink } from 'lucide-react';

const BOT_META: Record<string, { name: string; color: string; bg: string }> = {
  support_bot:   { name: 'Support Bot',   color: 'text-sky-600',    bg: 'bg-sky-50'    },
  sales_bot:     { name: 'Sales Bot',     color: 'text-violet-600', bg: 'bg-violet-50' },
  lifecycle_bot: { name: 'Lifecycle Bot', color: 'text-orange-600', bg: 'bg-orange-50' },
};

interface BotWebhookInfo {
  productType: string;
  webhookUrl: string;
  verifyToken: string | null;
  phoneNumber: string | null;
  configured: boolean;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy ${label ?? 'value'}`}
      className="shrink-0 p-1.5 rounded-md hover:bg-emerald-100 text-emerald-500 hover:text-emerald-700 transition-colors"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function CodeRow({ label, value, placeholder }: { label: string; value: string | null; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-2 bg-emerald-50 rounded-lg border border-emerald-100 px-3 py-2">
        <code className="flex-1 text-xs text-emerald-700 font-mono break-all">
          {value ?? <span className="text-slate-300 font-sans italic">{placeholder ?? 'Not configured'}</span>}
        </code>
        {value && <CopyButton text={value} label={label} />}
      </div>
    </div>
  );
}

export function WhatsAppSetupSection({ bots }: { bots: BotWebhookInfo[] }) {
  return (
    <div className="space-y-4">
      {/* Meta setup steps */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3.5">
        <p className="text-xs font-semibold text-indigo-800 mb-2 flex items-center gap-1.5">
          <ExternalLink size={12} />
          Meta Developer Console Setup
        </p>
        <ol className="text-xs text-indigo-700 space-y-1.5 list-none">
          {[
            'Go to developers.facebook.com → Your App → WhatsApp → Configuration',
            'Under "Webhook", click Edit and paste the Callback URL below',
            'Paste the Verify Token and click Verify & Save',
            'Under "Webhook fields", subscribe to the messages field',
            'Assign your Phone Number ID to the app and get a permanent access token',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Per-bot webhook cards */}
      {bots.map(bot => {
        const meta = BOT_META[bot.productType];
        return (
          <div key={bot.productType} className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${meta?.bg ?? 'bg-slate-50'} ${meta?.color ?? 'text-slate-600'}`}>
                {meta?.name ?? bot.productType}
              </span>
              {bot.configured ? (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Configured</span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">Not configured</span>
              )}
            </div>

            <CodeRow label="Callback URL (Webhook)" value={bot.webhookUrl} />
            <CodeRow
              label="Verify Token"
              value={bot.verifyToken}
              placeholder="Set by your account manager"
            />
            {bot.phoneNumber && (
              <CodeRow label="Phone Number" value={bot.phoneNumber} />
            )}
          </div>
        );
      })}
    </div>
  );
}
