'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, MessageSquare, CalendarClock, Settings2, ChevronLeft,
  ChevronRight, Search, X, Plus, Info, AlertTriangle,
} from 'lucide-react';
import { createScheduledMessageAction } from '@/app/actions/scheduled-messages';

interface Contact { id: string; phone: string; name: string | null }
interface Template { name: string; language: string; category: string; components: unknown[] }

const STEPS = [
  { id: 1, label: 'Recipients',  icon: Users          },
  { id: 2, label: 'Message',     icon: MessageSquare  },
  { id: 3, label: 'Schedule',    icon: CalendarClock  },
  { id: 4, label: 'Settings',    icon: Settings2      },
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function NewScheduledMessageForm({ contacts, templates }: { contacts: Contact[]; templates: Template[] }) {
  const router = useRouter();
  const [step,    setStep]    = useState(1);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Step 1 — Recipients
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState<Contact[]>([]);
  const [manualNum,  setManualNum]  = useState('');
  const [manualName, setManualName] = useState('');

  // Step 2 — Message
  const [msgBody,    setMsgBody]    = useState('');
  const [useTemplate, setUseTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateLang, setTemplateLang] = useState('en');

  // Step 3 — Schedule
  const [scheduledAt,   setScheduledAt]   = useState('');
  const [recurrenceType, setRecurrenceType] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [weekDays,      setWeekDays]      = useState<number[]>([]);
  const [dayOfMonth,    setDayOfMonth]    = useState(1);

  // Step 4 — Settings
  const [name,              setName]              = useState('');
  const [botHandlesReplies, setBotHandlesReplies] = useState(false);

  const filtered = useMemo(() =>
    contacts.filter(c =>
      !selected.find(s => s.phone === c.phone) &&
      (c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
    ),
    [contacts, selected, search]
  );

  function addContact(c: Contact) {
    setSelected(prev => [...prev, c]);
    setSearch('');
  }

  function addManual() {
    const phone = manualNum.trim().replace(/\s/g, '');
    if (!phone) return;
    if (selected.find(s => s.phone === phone)) return;
    setSelected(prev => [...prev, { id: '', phone, name: manualName.trim() || null }]);
    setManualNum('');
    setManualName('');
  }

  function removeSelected(phone: string) {
    setSelected(prev => prev.filter(s => s.phone !== phone));
  }

  function toggleWeekDay(d: number) {
    setWeekDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Please enter a name for this schedule'); return; }
    if (!selected.length) { setError('Add at least one recipient'); return; }
    if (!msgBody.trim() && !templateName) { setError('Enter a message body or select a template'); return; }
    if (!scheduledAt) { setError('Set a scheduled date and time'); return; }

    setSaving(true);
    setError(null);

    const result = await createScheduledMessageAction({
      tenantId:          '',
      name:              name.trim(),
      message_body:      msgBody.trim() || undefined,
      template_name:     templateName || undefined,
      template_language: templateLang,
      scheduled_at:      new Date(scheduledAt).toISOString(),
      recurrence: recurrenceType === 'once' ? { type: 'once' }
        : recurrenceType === 'daily' ? { type: 'daily' }
        : recurrenceType === 'weekly' ? { type: 'weekly', days_of_week: weekDays }
        : { type: 'monthly', day_of_month: dayOfMonth },
      bot_handles_replies: botHandlesReplies,
      recipients: selected.map(s => ({ phone: s.phone, contact_name: s.name ?? undefined, contact_id: s.id || undefined })),
    });

    setSaving(false);
    if (result.error) { setError(result.error); return; }
    router.push(`/scheduled-messages/${result.id}`);
  }

  const selectedTemplate = templates.find(t => t.name === templateName);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Scheduled Message</h1>
          <p className="text-xs text-gray-400">Configure and schedule your outbound WhatsApp message</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = step > s.id;
          const active = step === s.id;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                active ? 'bg-violet-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
              }`}>
                <Icon size={11} />
                {s.label}
              </div>
              {i < STEPS.length - 1 && <div className={`w-6 h-px ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

        {/* ── Step 1: Recipients ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">Select Recipients</h2>

            {/* Search existing contacts */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Search contacts</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or number..."
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
              {search && filtered.length > 0 && (
                <div className="mt-1 border border-gray-100 rounded-xl shadow-sm bg-white max-h-48 overflow-y-auto divide-y divide-gray-50">
                  {filtered.slice(0, 20).map(c => (
                    <button key={c.phone} type="button" onClick={() => addContact(c)}
                      className="w-full text-left px-4 py-2.5 hover:bg-violet-50 transition-colors flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-bold shrink-0">
                        {(c.name ?? c.phone).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{c.name ?? c.phone}</p>
                        {c.name && <p className="text-xs text-gray-400">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Manual entry */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Or add number manually</label>
              <div className="flex gap-2">
                <input type="text" value={manualNum} onChange={e => setManualNum(e.target.value)}
                  placeholder="+919XXXXXXXXX" className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
                  placeholder="Name (optional)" className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <button type="button" onClick={addManual}
                  className="px-3 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors">
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* Selected list */}
            {selected.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">{selected.length} recipient{selected.length > 1 ? 's' : ''} selected</p>
                <div className="flex flex-wrap gap-2">
                  {selected.map(s => (
                    <span key={s.phone} className="inline-flex items-center gap-1.5 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full">
                      {s.name ?? s.phone}
                      <button type="button" onClick={() => removeSelected(s.phone)} className="hover:text-red-500 transition-colors"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Message ────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">Compose Message</h2>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2.5 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Contacts outside the 24-hour WhatsApp session window require an approved template. The system detects this automatically at send time.</span>
            </div>

            {/* Free-form */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Message body <span className="text-gray-400">(sent to active-session contacts)</span></label>
              <textarea
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                rows={5}
                placeholder="Type your message here..."
                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{msgBody.length} characters</p>
            </div>

            {/* Template */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-500">Template fallback <span className="text-gray-400">(for out-of-window contacts)</span></label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-gray-500">Enable</span>
                  <div className={`w-8 h-4 rounded-full transition-colors ${useTemplate ? 'bg-violet-600' : 'bg-gray-200'}`}
                    onClick={() => setUseTemplate(v => !v)}>
                    <div className={`w-3 h-3 bg-white rounded-full shadow mt-0.5 transition-transform ${useTemplate ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              </div>

              {useTemplate && (
                <div className="space-y-3 pt-1">
                  {templates.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <Info size={13} />
                      No approved templates found. Create and approve templates in Meta Business Manager.
                    </div>
                  ) : (
                    <select value={templateName} onChange={e => {
                      const t = templates.find(t => t.name === e.target.value);
                      setTemplateName(e.target.value);
                      if (t) setTemplateLang(t.language);
                    }} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                      <option value="">Select a template...</option>
                      {templates.map(t => (
                        <option key={`${t.name}-${t.language}`} value={t.name}>
                          {t.name} ({t.language}) — {t.category}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedTemplate && (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-600">
                      <p className="font-semibold text-gray-700 mb-1">Template preview</p>
                      <p className="font-mono whitespace-pre-wrap">
                        {(selectedTemplate.components as { type: string; text?: string }[])
                          .find(c => c.type === 'BODY')?.text ?? 'No body text'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Schedule ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">Schedule Settings</h2>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Send date & time</label>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">Recurrence</label>
              <div className="grid grid-cols-4 gap-2">
                {(['once', 'daily', 'weekly', 'monthly'] as const).map(type => (
                  <button key={type} type="button"
                    onClick={() => setRecurrenceType(type)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-colors capitalize ${
                      recurrenceType === type ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
                    }`}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {recurrenceType === 'weekly' && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Days of week</label>
                <div className="flex gap-2">
                  {DAYS_OF_WEEK.map((d, i) => (
                    <button key={d} type="button" onClick={() => toggleWeekDay(i)}
                      className={`w-9 h-9 rounded-full text-xs font-semibold border transition-colors ${
                        weekDays.includes(i) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recurrenceType === 'monthly' && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Day of month</label>
                <input type="number" min={1} max={28} value={dayOfMonth} onChange={e => setDayOfMonth(parseInt(e.target.value, 10))}
                  className="w-24 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <p className="text-xs text-gray-400 mt-1">Max 28 to avoid month-end issues</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Settings & Review ──────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-gray-800">Settings & Review</h2>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Schedule name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Monday follow-up, Offer reminder..."
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>

            <div className="flex items-start justify-between p-4 rounded-xl border border-gray-100 bg-gray-50">
              <div>
                <p className="text-sm font-semibold text-gray-800">Bot handles replies</p>
                <p className="text-xs text-gray-400 mt-0.5">When enabled, replies from recipients are handled by the AI bot. Only works with Meta Cloud API.</p>
              </div>
              <button type="button" onClick={() => setBotHandlesReplies(v => !v)}
                className={`ml-4 w-10 h-5 rounded-full shrink-0 transition-colors ${botHandlesReplies ? 'bg-violet-600' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform ${botHandlesReplies ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Summary */}
            <div className="p-4 rounded-xl border border-violet-100 bg-violet-50 space-y-2 text-xs text-violet-800">
              <p className="font-semibold text-violet-900 mb-1">Summary</p>
              <p><span className="text-violet-500">Recipients:</span> {selected.length}</p>
              <p><span className="text-violet-500">Message:</span> {msgBody ? `Free-form (${msgBody.length} chars)` : '—'}{templateName ? ` + template "${templateName}"` : ''}</p>
              <p><span className="text-violet-500">Scheduled:</span> {scheduledAt ? new Date(scheduledAt).toLocaleString('en-IN') : '—'}</p>
              <p><span className="text-violet-500">Recurrence:</span> {recurrenceType}</p>
              <p><span className="text-violet-500">Bot replies:</span> {botHandlesReplies ? 'Yes' : 'No'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button type="button"
          onClick={() => setStep(s => Math.max(1, s - 1))}
          disabled={step === 1}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors">
          <ChevronLeft size={15} /> Back
        </button>
        {step < 4 ? (
          <button type="button"
            onClick={() => setStep(s => s + 1)}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors shadow-sm">
            Continue <ChevronRight size={15} />
          </button>
        ) : (
          <button type="button" onClick={() => void handleSubmit()} disabled={saving}
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-6 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-60">
            {saving ? 'Scheduling...' : 'Schedule Message'}
          </button>
        )}
      </div>
    </div>
  );
}
