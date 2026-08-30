'use client';

import { useState, useTransition } from 'react';
import {
  Copy, Check, Eye, EyeOff, RefreshCw, Save, Send,
  Zap, AlertCircle, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, Plug, ArrowDownCircle, ArrowUpCircle,
  Download, Users, MessageSquare, Target,
} from 'lucide-react';
import {
  saveWelcomeTemplate, toggleIntegration, regenerateApiKey, sendTestMessage,
  saveOutboundSettings, regenerateSigningSecret, triggerManualPush,
} from '@/app/actions/integrations';
import { OUTBOUND_EVENT_OPTIONS } from '@/lib/integration-constants';
import type { IntegrationSettings, WebhookLog, OutboundLog } from '@/app/actions/integrations';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" title="Copy"
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
        copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
      } ${className}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function MonoField({ value, hidden }: { value: string; hidden: boolean }) {
  return (
    <code className="text-xs font-mono text-slate-700 flex-1 break-all">
      {hidden ? value.replace(/./g, '•') : value}
    </code>
  );
}

const INBOUND_STATUS: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  sent:      { icon: <CheckCircle2 size={11} />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Sent' },
  failed:    { icon: <XCircle     size={11} />, cls: 'bg-red-50 text-red-700 border-red-200',             label: 'Failed' },
  duplicate: { icon: <Clock       size={11} />, cls: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'Duplicate' },
  skipped:   { icon: <Clock       size={11} />, cls: 'bg-slate-50 text-slate-600 border-slate-200',       label: 'Skipped' },
};

const OUTBOUND_STATUS: Record<string, { icon: React.ReactNode; cls: string }> = {
  delivered: { icon: <CheckCircle2 size={11} />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed:    { icon: <XCircle     size={11} />, cls: 'bg-red-50 text-red-700 border-red-200' },
  skipped:   { icon: <Clock       size={11} />, cls: 'bg-slate-50 text-slate-600 border-slate-200' },
};

function LogTable({ children, empty }: { children: React.ReactNode; empty: string }) {
  return (
    <div className="divide-y divide-slate-50">
      {children ?? <div className="px-5 py-10 text-center"><p className="text-sm text-slate-400 font-medium">{empty}</p></div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IntegrationsClient({
  settings,
  apiBase,
  initialInboundLogs,
  initialOutboundLogs,
}: {
  settings:            IntegrationSettings;
  apiBase:             string;
  initialInboundLogs:  WebhookLog[];
  initialOutboundLogs: OutboundLog[];
}) {
  const [tab, setTab] = useState<'inbound' | 'outbound'>('inbound');

  // ── Shared: enable toggle ──────────────────────────────────────────────────
  const [enabled,   setEnabled]   = useState(settings.enabled);
  const [toggling,  startToggle]  = useTransition();
  const [toggleErr, setToggleErr] = useState<string | null>(null);

  function handleToggle() {
    setToggleErr(null);
    startToggle(async () => {
      const r = await toggleIntegration(!enabled);
      if (r.error) { setToggleErr(r.error); return; }
      setEnabled(e => !e);
    });
  }

  const webhookUrl = `${apiBase}/api/integrations/webhook/contact`;

  return (
    <div className="space-y-5">

      {/* ── Status banner ───────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border ${
        enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
          <span className="text-sm font-semibold text-slate-800">
            Integrations are <span className={enabled ? 'text-emerald-700' : 'text-slate-500'}>{enabled ? 'active' : 'disabled'}</span>
          </span>
          {toggleErr && <span className="text-xs text-red-600 ml-2">{toggleErr}</span>}
        </div>
        <button type="button" onClick={handleToggle} disabled={toggling}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
            enabled ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
          }`}>
          {toggling ? 'Saving…' : enabled ? 'Disable all' : 'Enable'}
        </button>
      </div>

      {/* ── Tab switcher ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
        <button type="button" onClick={() => setTab('inbound')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            tab === 'inbound' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}>
          <ArrowDownCircle size={14} /> Inbound
        </button>
        <button type="button" onClick={() => setTab('outbound')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            tab === 'outbound' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}>
          <ArrowUpCircle size={14} /> Outbound
        </button>
      </div>

      {/* ── INBOUND TAB ─────────────────────────────────────────────────────── */}
      {tab === 'inbound' && (
        <InboundTab
          settings={settings}
          webhookUrl={webhookUrl}
          apiBase={apiBase}
          initialLogs={initialInboundLogs}
        />
      )}

      {/* ── OUTBOUND TAB ────────────────────────────────────────────────────── */}
      {tab === 'outbound' && (
        <OutboundTab
          settings={settings}
          apiBase={apiBase}
          initialLogs={initialOutboundLogs}
        />
      )}
    </div>
  );
}

// ─── Inbound tab ─────────────────────────────────────────────────────────────

function InboundTab({
  settings, webhookUrl, apiBase,
  initialLogs,
}: {
  settings:    IntegrationSettings;
  webhookUrl:  string;
  apiBase:     string;
  initialLogs: WebhookLog[];
}) {
  const [apiKey,    setApiKey]    = useState(settings.webhook_api_key);
  const [keyHidden, setKeyHidden] = useState(true);
  const [regen,     startRegen]   = useTransition();
  const [regenErr,  setRegenErr]  = useState<string | null>(null);

  const [template,  setTemplate]  = useState(settings.welcome_template);
  const [saving,    startSave]    = useTransition();
  const [saveMsg,   setSaveMsg]   = useState<string | null>(null);
  const [saveErr,   setSaveErr]   = useState<string | null>(null);

  const [testPhone, setTestPhone] = useState('');
  const [testName,  setTestName]  = useState('');
  const [testing,   startTest]    = useTransition();
  const [testResult,setTestResult]= useState<{ ok: boolean; msg: string } | null>(null);

  const [logs]           = useState<WebhookLog[]>(initialLogs);
  const [showAll, setShowAll] = useState(false);
  const displayedLogs = showAll ? logs : logs.slice(0, 10);

  const [openGuide, setOpenGuide] = useState<'curl' | 'zapier' | 'make'>('curl');

  const curlExample = `curl -X POST \\
  ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${keyHidden ? '<YOUR_API_KEY>' : apiKey}" \\
  -d '{"phone":"+919876543210","name":"Ravi Kumar","source":"my-crm"}'`;

  const zapierExample = `Action: Webhooks by Zapier → POST
URL:     ${webhookUrl}
Headers: x-api-key = ${keyHidden ? '<API_KEY>' : apiKey}
Body (JSON):
  phone  → {{contact phone field}}
  name   → {{contact name field}}
  source → zapier`;

  const makeExample = `Module: HTTP → Make a request
URL:    ${webhookUrl}
Method: POST
Header: x-api-key = ${keyHidden ? '<API_KEY>' : apiKey}
Body (JSON):
{
  "phone":  "{{contact.phone}}",
  "name":   "{{contact.name}}",
  "source": "make"
}`;

  void apiBase; // used via webhookUrl

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* LEFT */}
      <div className="space-y-5">

        {/* Endpoint */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Plug size={14} className="text-emerald-600" /> Webhook endpoint
          </h3>
          <p className="text-xs text-slate-500">
            Point your CRM, Zapier, or Make to this URL. Every call triggers a personalised WhatsApp welcome message.
          </p>
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
            <code className="text-xs font-mono text-slate-700 flex-1 break-all">{webhookUrl}</code>
            <CopyButton text={webhookUrl} />
          </div>
        </div>

        {/* API key */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Inbound API key</h3>
          <p className="text-xs text-slate-500">
            External systems pass this in the <code className="bg-slate-100 px-1 rounded">x-api-key</code> header to authenticate their requests to your webhook.
          </p>
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
            <MonoField value={apiKey} hidden={keyHidden} />
            <button type="button" onClick={() => setKeyHidden(h => !h)}
              className="text-slate-400 hover:text-slate-700 p-1 transition-colors">
              {keyHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <CopyButton text={apiKey} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={regen}
              onClick={() => {
                if (!confirm('Regenerating will break existing integrations using the old key. Continue?')) return;
                setRegenErr(null);
                startRegen(async () => {
                  const r = await regenerateApiKey();
                  if (r.error) { setRegenErr(r.error); return; }
                  if (r.key) setApiKey(r.key);
                });
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
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
            Use <code className="bg-slate-100 px-1 rounded">{'{name}'}</code> for the contact&apos;s first name. Sent once per contact (30-day deduplication).
          </p>
          <textarea value={template} rows={5} maxLength={1024}
            onChange={e => { setTemplate(e.target.value); setSaveMsg(null); setSaveErr(null); }}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">{template.length} / 1024</span>
            <div className="flex items-center gap-2">
              {saveMsg && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={11} />{saveMsg}</span>}
              {saveErr && <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{saveErr}</span>}
              <button type="button" disabled={saving}
                onClick={() => { setSaveMsg(null); setSaveErr(null); startSave(async () => { const r = await saveWelcomeTemplate(template); if (r.error) { setSaveErr(r.error); return; } setSaveMsg('Saved.'); setTimeout(() => setSaveMsg(null), 3000); }); }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                <Save size={11} />
                {saving ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>
        </div>

        {/* Test */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Send a test message</h3>
          <div className="flex gap-2">
            <input value={testName} onChange={e => setTestName(e.target.value)} placeholder="Name (optional)"
              className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+91 98765 43210"
              className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" disabled={testing || !testPhone.trim()}
              onClick={() => { setTestResult(null); startTest(async () => { const r = await sendTestMessage(testPhone, testName); setTestResult({ ok: !r.error, msg: r.error ?? 'Welcome message sent!' }); }); }}
              className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50">
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

      {/* RIGHT */}
      <div className="space-y-5">

        {/* Integration guides */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Zap size={14} className="text-amber-500" /> Integration guides
          </h3>
          <div className="flex gap-1 border-b border-slate-100 pb-2">
            {(['curl', 'zapier', 'make'] as const).map(g => (
              <button key={g} type="button" onClick={() => setOpenGuide(g)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors capitalize ${
                  openGuide === g ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {g === 'curl' ? 'cURL / REST' : g === 'zapier' ? 'Zapier' : 'Make'}
              </button>
            ))}
          </div>
          <div className="relative">
            <pre className="bg-slate-950 text-green-300 text-[11px] font-mono rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
              {openGuide === 'curl' ? curlExample : openGuide === 'zapier' ? zapierExample : makeExample}
            </pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={openGuide === 'curl' ? curlExample : openGuide === 'zapier' ? zapierExample : makeExample} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {['HubSpot', 'Zoho CRM', 'Salesforce', 'Zapier', 'Make', 'n8n', 'Pabbly', 'Webflow', 'Typeform', 'Google Sheets'].map(s => (
              <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{s}</span>
            ))}
          </div>
        </div>

        {/* Request / response format */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Request format</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-2">Headers</p>
              <div className="bg-slate-50 rounded-xl p-3 font-mono space-y-1">
                <p><span className="text-amber-600">x-api-key</span>: <span className="text-slate-500">your_key</span></p>
                <p><span className="text-amber-600">Content-Type</span>: <span className="text-slate-500">application/json</span></p>
              </div>
            </div>
            <div>
              <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-2">Body</p>
              <div className="bg-slate-50 rounded-xl p-3 font-mono space-y-1">
                <p><span className="text-emerald-700">phone</span> <span className="text-red-500">*</span></p>
                <p><span className="text-sky-700">name</span> <span className="text-slate-400">optional</span></p>
                <p><span className="text-sky-700">source</span> <span className="text-slate-400">optional</span></p>
              </div>
            </div>
          </div>
        </div>

        {/* Inbound log */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Inbound log</h3>
            <span className="text-xs text-slate-400">{logs.length} hits</span>
          </div>
          {logs.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-400 font-medium">No inbound webhook hits yet</p>
              <p className="text-xs text-slate-300 mt-1">Send a test message to see the first entry.</p>
            </div>
          ) : (
            <>
              <LogTable empty="">
                {displayedLogs.map(log => {
                  const s = INBOUND_STATUS[log.status] ?? INBOUND_STATUS.skipped!;
                  return (
                    <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                      <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${s.cls}`}>
                        {s.icon} {s.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">
                          {log.contact_name ? `${log.contact_name} — ` : ''}{log.contact_phone}
                        </p>
                        {log.error_message && <p className="text-[10px] text-red-500 truncate">{log.error_message}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {log.source && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{log.source}</span>}
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(log.triggered_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </LogTable>
              {logs.length > 10 && (
                <button type="button" onClick={() => setShowAll(s => !s)}
                  className="w-full py-3 text-xs font-semibold text-slate-500 hover:text-emerald-700 flex items-center justify-center gap-1 border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {logs.length}</>}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Outbound tab ─────────────────────────────────────────────────────────────

function OutboundTab({
  settings, initialLogs,
}: {
  settings:    IntegrationSettings;
  apiBase:     string;
  initialLogs: OutboundLog[];
}) {
  const [url,      setUrl]      = useState(settings.outbound_webhook_url ?? '');
  const [events,   setEvents]   = useState<string[]>(settings.outbound_events ?? []);
  const [saving,   startSave]   = useTransition();
  const [saveMsg,  setSaveMsg]  = useState<string | null>(null);
  const [saveErr,  setSaveErr]  = useState<string | null>(null);

  const [secret,      setSecret]      = useState(settings.outbound_signing_secret);
  const [secretHidden, setSecretHidden] = useState(true);
  const [regenSec,    startRegenSec]   = useTransition();
  const [regenSecErr, setRegenSecErr]  = useState<string | null>(null);

  const [logs] = useState<OutboundLog[]>(initialLogs);
  const [showAll, setShowAll] = useState(false);
  const displayedLogs = showAll ? logs : logs.slice(0, 10);

  // Manual push state per type
  type PushType = 'contacts' | 'conversations' | 'leads';
  const [pushing,    setPushing]    = useState<PushType | null>(null);
  const [pushResult, setPushResult] = useState<{ type: PushType; ok: boolean; msg: string } | null>(null);
  const [,           startPush]     = useTransition();

  function handlePush(type: PushType) {
    setPushResult(null);
    setPushing(type);
    startPush(async () => {
      const r = await triggerManualPush(type);
      setPushing(null);
      if (r.error) { setPushResult({ type, ok: false, msg: r.error }); return; }
      setPushResult({ type, ok: true, msg: `Pushed ${r.count ?? 0} ${type} to your endpoint.` });
    });
  }

  function toggleEvent(val: string) {
    setEvents(prev => prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val]);
  }

  const verifySnippet = `import { createHmac, timingSafeEqual } from 'crypto';

function verifyAlphabotSignature(
  rawBody: string,
  signature: string, // x-alphabot-signature header
  secret: string,    // your signing secret
): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}`;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* LEFT — config */}
      <div className="space-y-5">

        {/* Destination URL + events */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ArrowUpCircle size={14} className="text-violet-600" /> Destination webhook URL
          </h3>
          <p className="text-xs text-slate-500">
            We&apos;ll POST events to this URL whenever something important happens. Leave blank to disable outbound delivery.
          </p>

          <input
            value={url}
            onChange={e => { setUrl(e.target.value); setSaveMsg(null); setSaveErr(null); }}
            placeholder="https://hooks.zapier.com/hooks/catch/... or https://your-crm.com/webhook"
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />

          {/* Event subscriptions */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Subscribe to events</p>
            <div className="space-y-2">
              {OUTBOUND_EVENT_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={events.includes(opt.value)}
                    onChange={() => { toggleEvent(opt.value); setSaveMsg(null); setSaveErr(null); }}
                    className="mt-0.5 accent-violet-600"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 group-hover:text-violet-700 transition-colors">{opt.label}</p>
                    <p className="text-[11px] text-slate-400">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {saveMsg && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={11} />{saveMsg}</span>}
              {saveErr && <span className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} />{saveErr}</span>}
            </div>
            <button type="button" disabled={saving}
              onClick={() => { setSaveMsg(null); setSaveErr(null); startSave(async () => { const r = await saveOutboundSettings(url || null, events); if (r.error) { setSaveErr(r.error); return; } setSaveMsg('Saved.'); setTimeout(() => setSaveMsg(null), 3000); }); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
              <Save size={11} />
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>

        {/* Signing secret */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Signing secret</h3>
          <p className="text-xs text-slate-500">
            Every outbound request includes an <code className="bg-slate-100 px-1 rounded">x-alphabot-signature</code> header.
            Use this secret to verify the request is genuinely from us.
          </p>
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
            <MonoField value={secret} hidden={secretHidden} />
            <button type="button" onClick={() => setSecretHidden(h => !h)}
              className="text-slate-400 hover:text-slate-700 p-1 transition-colors">
              {secretHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <CopyButton text={secret} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={regenSec}
              onClick={() => {
                if (!confirm('Regenerate the signing secret? Any verification using the old secret will fail.')) return;
                setRegenSecErr(null);
                startRegenSec(async () => {
                  const r = await regenerateSigningSecret();
                  if (r.error) { setRegenSecErr(r.error); return; }
                  if (r.secret) setSecret(r.secret);
                });
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
              <RefreshCw size={11} className={regenSec ? 'animate-spin' : ''} />
              {regenSec ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
          {regenSecErr && <p className="text-xs text-red-600">{regenSecErr}</p>}
        </div>

        {/* Manual push */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Download size={14} className="text-violet-600" /> Push data now
          </h3>
          <p className="text-xs text-slate-500">
            Send a full snapshot of your data to your configured endpoint. Useful for initial CRM sync or on-demand exports.
          </p>

          {!url.trim() && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertCircle size={12} className="shrink-0" />
              Configure a destination URL above before pushing data.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {([
              { type: 'contacts' as PushType,      icon: <Users         size={14} />, label: 'Contacts',      color: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' },
              { type: 'conversations' as PushType,  icon: <MessageSquare size={14} />, label: 'Conversations',  color: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100' },
              { type: 'leads' as PushType,          icon: <Target        size={14} />, label: 'Leads',          color: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100' },
            ]).map(({ type, icon, label, color }) => (
              <button key={type} type="button"
                disabled={!url.trim() || pushing === type}
                onClick={() => handlePush(type)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-40 ${color}`}
              >
                {pushing === type ? <RefreshCw size={14} className="animate-spin" /> : icon}
                {pushing === type ? 'Pushing…' : `Push ${label}`}
              </button>
            ))}
          </div>

          {pushResult && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border ${
              pushResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {pushResult.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              {pushResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — docs + log */}
      <div className="space-y-5">

        {/* Event payload reference */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Event payload format</h3>
          <p className="text-xs text-slate-500">Every outbound request is a JSON POST with this envelope:</p>
          <pre className="bg-slate-950 text-green-300 text-[11px] font-mono rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{`{
  "event":      "contact.created",   // event type
  "timestamp":  "2026-01-01T10:00:00Z",
  "tenant_id":  "your-tenant-uuid",
  "data": {
    // contact.created / contact.updated
    "id":         "contact-uuid",
    "phone":      "+919876543210",
    "name":       "Ravi Kumar",
    "sentiment":  "positive",

    // conversation.resolved / conversation.escalated
    "conversation_id": "uuid",
    "product_type":    "support_bot",
    "contact_phone":   "+91...",
    "contact_name":    "Ravi Kumar",

    // data.export (manual push)
    "export_type": "contacts",
    "count":       45,
    "records":     [...]
  }
}`}</pre>
        </div>

        {/* Signature verification */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Signature verification</h3>
          <p className="text-xs text-slate-500">Verify the <code className="bg-slate-100 px-1 rounded">x-alphabot-signature</code> header to ensure the request is from us:</p>
          <div className="relative">
            <pre className="bg-slate-950 text-sky-300 text-[11px] font-mono rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{verifySnippet}</pre>
            <div className="absolute top-2 right-2"><CopyButton text={verifySnippet} /></div>
          </div>
        </div>

        {/* Outbound log */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Outbound delivery log</h3>
            <span className="text-xs text-slate-400">{logs.length} events</span>
          </div>
          {logs.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-400 font-medium">No outbound deliveries yet</p>
              <p className="text-xs text-slate-300 mt-1">Configure a URL, subscribe to events, and they&apos;ll appear here.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-50">
                {displayedLogs.map(log => {
                  const s = OUTBOUND_STATUS[log.status] ?? OUTBOUND_STATUS.skipped!;
                  return (
                    <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                      <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${s.cls}`}>
                        {s.icon} {log.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800">{log.event_type}</p>
                        {log.error_message && <p className="text-[10px] text-red-500 truncate">{log.error_message}</p>}
                        {log.http_status && <p className="text-[10px] text-slate-400">HTTP {log.http_status}</p>}
                      </div>
                      <p className="text-[10px] text-slate-400 shrink-0">
                        {new Date(log.triggered_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                      </p>
                    </div>
                  );
                })}
              </div>
              {logs.length > 10 && (
                <button type="button" onClick={() => setShowAll(s => !s)}
                  className="w-full py-3 text-xs font-semibold text-slate-500 hover:text-violet-700 flex items-center justify-center gap-1 border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {logs.length}</>}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
