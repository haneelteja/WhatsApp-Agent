'use client';

import { useState, useTransition } from 'react';
import {
  Copy, Check, Eye, EyeOff, RefreshCw, Save, Send,
  Zap, AlertCircle, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, Plug,
} from 'lucide-react';
import {
  saveWelcomeTemplate,
  toggleIntegration,
  regenerateApiKey,
  sendTestMessage,
} from '@/app/actions/integrations';
import type { IntegrationSettings, WebhookLog } from '@/app/actions/integrations';

// ─── Copy-to-clipboard button ─────────────────────────────────────────────────

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy"
      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
        copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
      } ${className}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  sent:      { icon: <CheckCircle2 size={11} />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Sent' },
  failed:    { icon: <XCircle     size={11} />, cls: 'bg-red-50 text-red-700 border-red-200',             label: 'Failed' },
  duplicate: { icon: <Clock       size={11} />, cls: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'Duplicate' },
  skipped:   { icon: <Clock       size={11} />, cls: 'bg-slate-50 text-slate-600 border-slate-200',       label: 'Skipped' },
};

// ─── Main component ───────────────────────────────────────────────────────────

export function IntegrationsClient({
  settings,
  apiBase,
  initialLogs,
}: {
  settings:    IntegrationSettings;
  apiBase:     string;
  initialLogs: WebhookLog[];
}) {
  const webhookUrl = `${apiBase}/api/integrations/webhook/contact`;

  // ── API key state ──────────────────────────────────────────────────────────
  const [apiKey,    setApiKey]    = useState(settings.webhook_api_key);
  const [keyHidden, setKeyHidden] = useState(true);
  const [regen,     startRegen]   = useTransition();
  const [regenErr,  setRegenErr]  = useState<string | null>(null);

  function handleRegenerate() {
    if (!confirm('Regenerating the API key will break any existing integrations using the old key. Continue?')) return;
    setRegenErr(null);
    startRegen(async () => {
      const r = await regenerateApiKey();
      if (r.error) { setRegenErr(r.error); return; }
      if (r.key) setApiKey(r.key);
    });
  }

  // ── Enable toggle ──────────────────────────────────────────────────────────
  const [enabled,    setEnabled]    = useState(settings.enabled);
  const [toggling,   startToggle]   = useTransition();
  const [toggleErr,  setToggleErr]  = useState<string | null>(null);

  function handleToggle() {
    setToggleErr(null);
    startToggle(async () => {
      const r = await toggleIntegration(!enabled);
      if (r.error) { setToggleErr(r.error); return; }
      setEnabled(e => !e);
    });
  }

  // ── Template editor ────────────────────────────────────────────────────────
  const [template,    setTemplate]    = useState(settings.welcome_template);
  const [saving,      startSave]      = useTransition();
  const [saveMsg,     setSaveMsg]     = useState<string | null>(null);
  const [saveErr,     setSaveErr]     = useState<string | null>(null);

  function handleSave() {
    setSaveMsg(null); setSaveErr(null);
    startSave(async () => {
      const r = await saveWelcomeTemplate(template);
      if (r.error) { setSaveErr(r.error); return; }
      setSaveMsg('Template saved.');
      setTimeout(() => setSaveMsg(null), 3000);
    });
  }

  // ── Test message ───────────────────────────────────────────────────────────
  const [testPhone,   setTestPhone]   = useState('');
  const [testName,    setTestName]    = useState('');
  const [testing,     startTest]      = useTransition();
  const [testResult,  setTestResult]  = useState<{ ok: boolean; msg: string } | null>(null);

  function handleTest() {
    setTestResult(null);
    startTest(async () => {
      const r = await sendTestMessage(testPhone, testName);
      if (r.error) { setTestResult({ ok: false, msg: r.error }); return; }
      setTestResult({ ok: true, msg: 'Welcome message sent successfully!' });
    });
  }

  // ── Logs ───────────────────────────────────────────────────────────────────
  const [logs]           = useState<WebhookLog[]>(initialLogs);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const displayedLogs    = showAllLogs ? logs : logs.slice(0, 10);

  // ── Code samples ──────────────────────────────────────────────────────────
  const curlExample = `curl -X POST \\
  ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${keyHidden ? '<YOUR_API_KEY>' : apiKey}" \\
  -d '{
    "phone":  "+919876543210",
    "name":   "Ravi Kumar",
    "source": "my-crm"
  }'`;

  const zapierExample = `1. In Zapier, add an Action step → Webhooks by Zapier → POST
2. URL: ${webhookUrl}
3. Payload Type: JSON
4. Data:
   phone  → {{contact phone field}}
   name   → {{contact name field}}
   source → zapier
5. Headers:
   x-api-key → ${keyHidden ? '<YOUR_API_KEY>' : apiKey}`;

  const makeExample = `1. In Make, add an HTTP → Make a request module
2. URL: ${webhookUrl}
3. Method: POST
4. Headers: x-api-key = ${keyHidden ? '<YOUR_API_KEY>' : apiKey}
5. Body type: Raw — JSON
6. Content:
{
  "phone":  "{{contact.phone}}",
  "name":   "{{contact.name}}",
  "source": "make"
}`;

  const [openGuide, setOpenGuide] = useState<'curl' | 'zapier' | 'make' | null>('curl');

  return (
    <div className="space-y-6">

      {/* ── Status banner ─────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border ${
        enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
          <span className="text-sm font-semibold text-slate-800">
            Webhook integration is <span className={enabled ? 'text-emerald-700' : 'text-slate-500'}>{enabled ? 'active' : 'disabled'}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
            enabled
              ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
              : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
          }`}
        >
          {toggling ? 'Saving…' : enabled ? 'Disable' : 'Enable'}
        </button>
        {toggleErr && <p className="text-xs text-red-600 ml-2">{toggleErr}</p>}
      </div>

      {/* ── Two-column grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* LEFT ── Endpoint + API key ──────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Webhook URL */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Plug size={14} className="text-emerald-600" /> Webhook endpoint
            </h3>
            <p className="text-xs text-slate-500">
              Point your CRM, Zapier, or Make to this URL to send a welcome WhatsApp message when a new lead is created.
            </p>
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
              <code className="text-xs font-mono text-slate-700 flex-1 break-all">{webhookUrl}</code>
              <CopyButton text={webhookUrl} />
            </div>
          </div>

          {/* API key */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">API key</h3>
            <p className="text-xs text-slate-500">
              Pass this in the <code className="bg-slate-100 px-1 rounded">x-api-key</code> header with every request. Keep it secret.
            </p>
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
              <code className="text-xs font-mono text-slate-700 flex-1 break-all">
                {keyHidden ? apiKey.replace(/./g, '•') : apiKey}
              </code>
              <button
                type="button"
                onClick={() => setKeyHidden(h => !h)}
                className="text-slate-400 hover:text-slate-700 transition-colors p-1"
                title={keyHidden ? 'Reveal key' : 'Hide key'}
              >
                {keyHidden ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <CopyButton text={apiKey} />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regen}
                className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                <RefreshCw size={11} className={regen ? 'animate-spin' : ''} />
                {regen ? 'Regenerating…' : 'Regenerate key'}
              </button>
              <span className="text-slate-300 text-xs">· breaks existing integrations</span>
            </div>
            {regenErr && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{regenErr}</p>}
          </div>

          {/* Welcome template */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Welcome message template</h3>
            <p className="text-xs text-slate-500">
              Use <code className="bg-slate-100 px-1 rounded">{'{name}'}</code> to insert the contact&apos;s first name.
              This is sent the first time a contact triggers your webhook.
            </p>
            <textarea
              value={template}
              onChange={e => { setTemplate(e.target.value); setSaveMsg(null); setSaveErr(null); }}
              rows={5}
              maxLength={1024}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">{template.length} / 1024</span>
              <div className="flex items-center gap-2">
                {saveMsg && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={11} />{saveMsg}</span>}
                {saveErr && <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{saveErr}</span>}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save size={11} />
                  {saving ? 'Saving…' : 'Save template'}
                </button>
              </div>
            </div>
          </div>

          {/* Test message */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Send a test message</h3>
            <p className="text-xs text-slate-500">
              Verify your welcome message looks right before connecting your CRM.
            </p>
            <div className="flex gap-2">
              <input
                value={testName}
                onChange={e => setTestName(e.target.value)}
                placeholder="Name (optional)"
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
              <input
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !testPhone.trim()}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send size={13} />
                {testing ? 'Sending…' : 'Send test'}
              </button>
              {testResult && (
                <span className={`text-xs flex items-center gap-1.5 ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {testResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {testResult.msg}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT ── Integration guides + logs ────────────────────────────────── */}
        <div className="space-y-5">

          {/* Integration guides */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Zap size={14} className="text-amber-500" /> Integration guides
            </h3>
            <p className="text-xs text-slate-500">
              Connect any CRM, form builder, or automation platform in minutes using these copy-paste snippets.
            </p>

            {/* Guide tabs */}
            <div className="flex gap-1 border-b border-slate-100 pb-2">
              {(['curl', 'zapier', 'make'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setOpenGuide(o => o === g ? null : g)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors capitalize ${
                    openGuide === g ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {g === 'curl' ? 'cURL / REST' : g === 'zapier' ? 'Zapier' : 'Make (Integromat)'}
                </button>
              ))}
            </div>

            {openGuide === 'curl' && (
              <div className="relative">
                <pre className="bg-slate-950 text-green-300 text-[11px] font-mono rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
                  {curlExample}
                </pre>
                <div className="absolute top-2 right-2">
                  <CopyButton text={curlExample} />
                </div>
              </div>
            )}

            {openGuide === 'zapier' && (
              <div className="relative">
                <pre className="bg-slate-950 text-sky-300 text-[11px] font-mono rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
                  {zapierExample}
                </pre>
                <div className="absolute top-2 right-2">
                  <CopyButton text={zapierExample} />
                </div>
              </div>
            )}

            {openGuide === 'make' && (
              <div className="relative">
                <pre className="bg-slate-950 text-violet-300 text-[11px] font-mono rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
                  {makeExample}
                </pre>
                <div className="absolute top-2 right-2">
                  <CopyButton text={makeExample} />
                </div>
              </div>
            )}

            {/* Supported sources */}
            <div className="pt-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Works with any tool that can send HTTP POST:</p>
              <div className="flex flex-wrap gap-2">
                {['HubSpot', 'Zoho CRM', 'Salesforce', 'Zapier', 'Make', 'n8n', 'Pabbly', 'Webflow', 'Typeform', 'Google Sheets'].map(s => (
                  <span key={s} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Request / response reference */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Request format</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-2">Headers</p>
                <div className="bg-slate-50 rounded-xl p-3 font-mono space-y-1">
                  <p><span className="text-amber-600">x-api-key</span>: <span className="text-slate-500">your_api_key</span></p>
                  <p><span className="text-amber-600">Content-Type</span>: <span className="text-slate-500">application/json</span></p>
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-2">Body fields</p>
                <div className="bg-slate-50 rounded-xl p-3 font-mono space-y-1">
                  <p><span className="text-emerald-700">phone</span> <span className="text-red-500">*</span> <span className="text-slate-400">string</span></p>
                  <p><span className="text-sky-700">name</span> <span className="text-slate-400">string</span></p>
                  <p><span className="text-sky-700">source</span> <span className="text-slate-400">string</span></p>
                </div>
              </div>
            </div>
            <div>
              <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-2">Response</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 font-mono">
                  <p className="text-emerald-800 font-semibold mb-1">200 — Success</p>
                  <p className="text-slate-600">{`{ "sent": true }`}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 font-mono">
                  <p className="text-amber-800 font-semibold mb-1">200 — Duplicate</p>
                  <p className="text-slate-600">{`{ "sent": false, "reason": "already_welcomed..." }`}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Webhook log */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Recent webhook hits</h3>
              <span className="text-xs text-slate-400">{logs.length} total</span>
            </div>

            {logs.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-slate-400 font-medium">No webhook hits yet</p>
                <p className="text-xs text-slate-300 mt-1">Send a test message above to see your first log entry.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-50">
                  {displayedLogs.map(log => {
                    const style = STATUS_STYLES[log.status] ?? STATUS_STYLES.skipped!;
                    return (
                      <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                        <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.cls}`}>
                          {style.icon} {style.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">
                            {log.contact_name ? `${log.contact_name} — ` : ''}{log.contact_phone}
                          </p>
                          {log.error_message && (
                            <p className="text-[10px] text-red-500 truncate">{log.error_message}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {log.source && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{log.source}</span>
                          )}
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(log.triggered_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {logs.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setShowAllLogs(s => !s)}
                    className="w-full py-3 text-xs font-semibold text-slate-500 hover:text-emerald-700 flex items-center justify-center gap-1 border-t border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    {showAllLogs ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {logs.length} entries</>}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
