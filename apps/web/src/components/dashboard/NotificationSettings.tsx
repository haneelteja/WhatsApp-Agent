'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { X, Plus, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

interface Props {
  initialEmails: string[];
  initialWaNumbers: string[];
  initialCustomerMessage: string;
  initialFromEmail: string;
  initialResendConfigured: boolean;
  initialResendKeyMasked: string;
}

type ValidationState = 'idle' | 'validating' | 'ok' | 'warn' | 'error';

export function NotificationSettings({
  initialEmails,
  initialWaNumbers,
  initialCustomerMessage,
  initialFromEmail,
  initialResendConfigured,
  initialResendKeyMasked,
}: Props) {
  const [emails, setEmails]           = useState<string[]>(initialEmails);
  const [waNumbers, setWaNumbers]     = useState<string[]>(initialWaNumbers);
  const [customerMsg, setCustomerMsg] = useState(initialCustomerMessage);
  const [fromEmail, setFromEmail]     = useState(initialFromEmail);

  // Resend key — empty means "not changing"; placeholder shows masked value if already set
  const [resendKey, setResendKey]         = useState('');
  const [showKey, setShowKey]             = useState(false);
  const [resendConfigured, setResendConfigured] = useState(initialResendConfigured);
  const [resendKeyMasked, setResendKeyMasked]   = useState(initialResendKeyMasked);

  const [validationState, setValidationState]   = useState<ValidationState>('idle');
  const [validationMsg, setValidationMsg]       = useState('');

  const [emailInput, setEmailInput] = useState('');
  const [waInput, setWaInput]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);

  const supabase = getSupabaseBrowserClient();

  function addEmail() {
    const val = emailInput.trim().toLowerCase();
    if (!val || emails.includes(val)) return;
    setEmails(prev => [...prev, val]);
    setEmailInput('');
  }

  function removeEmail(email: string) {
    setEmails(prev => prev.filter(e => e !== email));
  }

  function addWa() {
    const val = waInput.trim();
    if (!val || waNumbers.includes(val)) return;
    setWaNumbers(prev => [...prev, val]);
    setWaInput('');
  }

  function removeWa(number: string) {
    setWaNumbers(prev => prev.filter(n => n !== number));
  }

  async function handleValidate() {
    const keyToValidate = resendKey.trim();
    if (!keyToValidate) {
      setValidationState('error');
      setValidationMsg('Enter a Resend API key to validate.');
      return;
    }
    if (!fromEmail.trim()) {
      setValidationState('error');
      setValidationMsg('Enter a From email address before validating.');
      return;
    }

    setValidationState('validating');
    setValidationMsg('');

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/settings/notifications/validate-resend`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ api_key: keyToValidate, from_email: fromEmail.trim() }),
      }
    );

    const json = await res.json() as {
      success: boolean;
      key_valid?: boolean;
      domain_verified?: boolean;
      message?: string;
      error?: string;
    };

    if (!json.success || !json.key_valid) {
      setValidationState('error');
      setValidationMsg(json.error ?? json.message ?? 'Validation failed.');
    } else if (!json.domain_verified) {
      setValidationState('warn');
      setValidationMsg(json.message ?? 'API key valid but domain not verified.');
    } else {
      setValidationState('ok');
      setValidationMsg(json.message ?? 'Ready to send.');
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';

    const body: Record<string, unknown> = {
      escalation_emails:           emails,
      escalation_wa_numbers:       waNumbers,
      escalation_customer_message: customerMsg,
      from_email:                  fromEmail || null,
    };

    // Only send resend_api_key if the user typed a new one
    if (resendKey.trim()) body.resend_api_key = resendKey.trim();

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/settings/notifications`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }
    );

    const json = await res.json() as {
      success: boolean;
      data?: { resend_configured?: boolean; resend_api_key_masked?: string };
    };

    if (json.success && json.data) {
      setResendConfigured(json.data.resend_configured ?? false);
      setResendKeyMasked(json.data.resend_api_key_masked ?? '');
      setResendKey(''); // clear input — masked value now shown as placeholder
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="divide-y divide-slate-100">
      {/* Resend configuration */}
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Resend email configuration</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Provide your own Resend API key and a verified sender address so escalation emails are sent from your account.
            </p>
          </div>
          {resendConfigured && (
            <span className="shrink-0 flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
              <CheckCircle2 size={11} />
              Configured
            </span>
          )}
        </div>

        {/* From email */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">From email address</label>
          <input
            type="email"
            value={fromEmail}
            onChange={e => { setFromEmail(e.target.value); setValidationState('idle'); }}
            placeholder="noreply@yourdomain.com"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
          />
        </div>

        {/* API key */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Resend API key</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={resendKey}
                onChange={e => { setResendKey(e.target.value); setValidationState('idle'); }}
                placeholder={resendConfigured ? resendKeyMasked || '••••••••' : 're_xxxxxxxxxxxx'}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              type="button"
              onClick={handleValidate}
              disabled={validationState === 'validating'}
              className="shrink-0 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {validationState === 'validating' ? <Loader2 size={13} className="animate-spin" /> : null}
              Validate
            </button>
          </div>
        </div>

        {/* Validation feedback */}
        {validationState !== 'idle' && validationState !== 'validating' && (
          <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${
            validationState === 'ok'   ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            validationState === 'warn' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                        'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {validationState === 'ok'   ? <CheckCircle2 size={13} className="shrink-0 mt-px" /> :
             validationState === 'warn' ? <AlertCircle  size={13} className="shrink-0 mt-px" /> :
                                         <AlertCircle  size={13} className="shrink-0 mt-px" />}
            <span>{validationMsg}</span>
          </div>
        )}

        {resendConfigured && !resendKey && (
          <p className="text-[11px] text-slate-400 italic">A key is already saved. Enter a new key above only if you want to replace it.</p>
        )}
      </div>

      {/* Escalation emails */}
      <div className="px-5 py-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Alert emails</p>
        <div className="flex flex-wrap gap-2">
          {emails.map(email => (
            <span key={email} className="flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
              {email}
              <button type="button" onClick={() => removeEmail(email)} className="text-slate-400 hover:text-red-500 transition-colors">
                <X size={11} />
              </button>
            </span>
          ))}
          {emails.length === 0 && <p className="text-xs text-slate-400 italic">No emails configured</p>}
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())}
            placeholder="team@company.com"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={addEmail}
            className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition-colors shrink-0"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* WhatsApp numbers */}
      <div className="px-5 py-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Alert WhatsApp numbers</p>
        <p className="text-xs text-slate-400">Include country code, e.g. +919XXXXXXXXX</p>
        <div className="flex flex-wrap gap-2">
          {waNumbers.map(num => (
            <span key={num} className="flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-mono">
              {num}
              <button type="button" onClick={() => removeWa(num)} className="text-slate-400 hover:text-red-500 transition-colors">
                <X size={11} />
              </button>
            </span>
          ))}
          {waNumbers.length === 0 && <p className="text-xs text-slate-400 italic">No numbers configured</p>}
        </div>
        <div className="flex gap-2">
          <input
            type="tel"
            value={waInput}
            onChange={e => setWaInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addWa())}
            placeholder="+919XXXXXXXXX"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
          />
          <button
            type="button"
            onClick={addWa}
            className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition-colors shrink-0"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* Customer acknowledgment message */}
      <div className="px-5 py-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer acknowledgment message</p>
        <p className="text-xs text-slate-400">Sent to the customer on WhatsApp when their conversation is escalated</p>
        <textarea
          value={customerMsg}
          onChange={e => setCustomerMsg(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Save */}
      <div className="px-5 py-4 flex items-center justify-between">
        <p className={`text-xs transition-opacity ${saved ? 'text-emerald-600 opacity-100' : 'opacity-0'}`}>
          Saved successfully
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
