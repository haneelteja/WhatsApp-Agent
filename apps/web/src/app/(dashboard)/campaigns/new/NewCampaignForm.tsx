'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

type Channel = 'whatsapp' | 'voice' | 'both';

type Props = {
  tenantId:    string;
  productSlugs: string[];
  apiBase:     string;
};

const SLUG_LABELS: Record<string, string> = {
  support_bot:   'Support Bot',
  sales_bot:     'Sales Bot',
  lifecycle_bot: 'Lifecycle Bot',
};

function parseContacts(raw: string): Array<{ phone_number: string; customer_name?: string }> {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [phone, ...nameParts] = line.split(',');
      const phone_number = phone?.trim() ?? '';
      const customer_name = nameParts.join(',').trim() || undefined;
      return { phone_number, customer_name };
    })
    .filter(c => c.phone_number.length > 0);
}

export function NewCampaignForm({ tenantId, productSlugs, apiBase }: Props) {
  const router = useRouter();

  const [name,            setName]            = useState('');
  const [channel,         setChannel]         = useState<Channel>('whatsapp');
  const [productSlug,     setProductSlug]     = useState(productSlugs[0] ?? 'support_bot');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [voiceScript,     setVoiceScript]     = useState('');
  const [scheduleAt,      setScheduleAt]      = useState('');
  const [contactsRaw,     setContactsRaw]     = useState('');
  const [error,           setError]           = useState('');
  const [busy,            setBusy]            = useState(false);

  const needsWA    = channel === 'whatsapp' || channel === 'both';
  const needsVoice = channel === 'voice' || channel === 'both';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const contacts = parseContacts(contactsRaw);
    if (contacts.length === 0) {
      setError('Add at least one contact (phone number per line).');
      return;
    }
    if (needsWA && !messageTemplate.trim()) {
      setError('WhatsApp message template is required for this channel.');
      return;
    }
    if (needsVoice && !voiceScript.trim()) {
      setError('Voice script / greeting is required for this channel.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/campaigns/${tenantId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:             name.trim(),
          channel,
          product_slug:     productSlug,
          message_template: needsWA    ? messageTemplate.trim() : undefined,
          voice_script:     needsVoice ? voiceScript.trim()     : undefined,
          schedule_at:      scheduleAt || undefined,
          contacts,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? 'Failed to create campaign.');
        return;
      }

      const { id } = await res.json() as { id: string };
      router.push(`/campaigns/${id}`);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-shadow bg-white';
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1.5';
  const helpCls  = 'text-[11px] text-gray-400 mt-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Back */}
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft size={14} /> Back to campaigns
      </Link>

      <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6 space-y-5">

        {/* Name */}
        <div>
          <label className={labelCls}>Campaign name</label>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. July follow-up calls"
            className={inputCls}
          />
        </div>

        {/* Channel */}
        <div>
          <label className={labelCls}>Channel</label>
          <div className="flex gap-2 flex-wrap">
            {(['whatsapp', 'voice', 'both'] as Channel[]).map(ch => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  channel === ch
                    ? ch === 'whatsapp' ? 'bg-emerald-600 text-white border-emerald-600'
                    : ch === 'voice'    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {ch === 'whatsapp' ? 'WhatsApp' : ch === 'voice' ? 'Voice calls' : 'WhatsApp + Voice'}
              </button>
            ))}
          </div>
        </div>

        {/* Product */}
        <div>
          <label className={labelCls}>Bot / Product</label>
          <select
            value={productSlug}
            onChange={e => setProductSlug(e.target.value)}
            className={inputCls}
          >
            {productSlugs.length > 0
              ? productSlugs.map(s => (
                  <option key={s} value={s}>{SLUG_LABELS[s] ?? s}</option>
                ))
              : <option value="support_bot">Support Bot</option>
            }
          </select>
          <p className={helpCls}>The bot that handles replies from contacts in this campaign.</p>
        </div>

        {/* Message template */}
        {needsWA && (
          <div>
            <label className={labelCls}>WhatsApp message template</label>
            <textarea
              required={needsWA}
              rows={4}
              value={messageTemplate}
              onChange={e => setMessageTemplate(e.target.value)}
              placeholder="Hi {{name}}, this is Elma Industries. We wanted to follow up on your recent inquiry..."
              className={`${inputCls} resize-y`}
            />
            <p className={helpCls}>Use {'{{name}}'} or {'{{customer_name}}'} to personalise. Other column names from your CSV also work.</p>
          </div>
        )}

        {/* Voice script */}
        {needsVoice && (
          <div>
            <label className={labelCls}>Voice greeting / script</label>
            <textarea
              required={needsVoice}
              rows={3}
              value={voiceScript}
              onChange={e => setVoiceScript(e.target.value)}
              placeholder="Hello {{name}}, I'm calling from Elma Industries regarding your recent enquiry. How can I help you today?"
              className={`${inputCls} resize-y`}
            />
            <p className={helpCls}>The AI will greet the caller with this, then continue the conversation based on bot guardrails.</p>
          </div>
        )}

        {/* Schedule */}
        <div>
          <label className={labelCls}>Schedule <span className="font-normal text-gray-400">(optional — leave blank to save as draft)</span></label>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={e => setScheduleAt(e.target.value)}
            className={inputCls}
          />
          <p className={helpCls}>If left blank, the campaign is saved as a draft. Launch it manually from the campaign detail page.</p>
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Contacts</h3>
          <p className="text-xs text-gray-500 mt-0.5">Paste one contact per line. Format: <code className="bg-gray-100 px-1 rounded text-[11px]">phone_number</code> or <code className="bg-gray-100 px-1 rounded text-[11px]">phone_number, Customer Name</code></p>
        </div>
        <textarea
          required
          rows={8}
          value={contactsRaw}
          onChange={e => setContactsRaw(e.target.value)}
          placeholder={`+919876543210, Ravi Kumar\n+918765432109, Priya Sharma\n+917654321098`}
          className={`${inputCls} font-mono text-xs resize-y`}
          spellCheck={false}
        />
        {contactsRaw.trim() && (
          <p className="text-[11px] text-emerald-600 font-medium">
            {parseContacts(contactsRaw).length} contact{parseContacts(contactsRaw).length !== 1 ? 's' : ''} parsed
          </p>
        )}
        <p className="text-[11px] text-gray-400">
          Phone numbers must include country code (e.g. +91 for India). Max 10,000 contacts per campaign.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 bg-emerald-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {scheduleAt ? 'Schedule campaign' : 'Save as draft'}
        </button>
        <Link
          href="/campaigns"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
