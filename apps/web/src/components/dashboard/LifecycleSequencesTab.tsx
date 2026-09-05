'use client';

import { useState, useTransition } from 'react';
import {
  Plus, Trash2, ChevronDown, ChevronRight, Clock, Zap, Gift,
  MessageSquare, CheckCircle, Edit3, Save, X, ToggleLeft, ToggleRight, Package,
} from 'lucide-react';
import {
  createLifecycleSequence,
  updateLifecycleSequence,
  toggleLifecycleSequence,
  deleteLifecycleSequence,
} from '@/app/actions/lifecycle';
import type { LifecycleSequence, TriggerEvent } from '@/app/actions/lifecycle';

// ─── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS: { value: TriggerEvent; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'contact_created',
    label: 'Contact onboarded',
    desc: 'Fires N days after a contact first messages your bot',
    icon: <Zap size={13} className="text-emerald-500" />,
  },
  {
    value: 'conversation_resolved',
    label: 'Conversation resolved',
    desc: 'Fires N days after a conversation is marked resolved',
    icon: <CheckCircle size={13} className="text-sky-500" />,
  },
  {
    value: 'lead_created',
    label: 'Lead flagged',
    desc: 'Fires N days after a contact is detected as a sales lead',
    icon: <Gift size={13} className="text-violet-500" />,
  },
  {
    value: 'order_delivered',
    label: 'Order delivered',
    desc: 'Fires N days after an order status is marked as delivered — great for loyalty & reorder nudges',
    icon: <Package size={13} className="text-orange-500" />,
  },
];

const TRIGGER_COLORS: Record<TriggerEvent, string> = {
  contact_created:       'bg-emerald-50 border-emerald-200 text-emerald-700',
  conversation_resolved: 'bg-sky-50 border-sky-200 text-sky-700',
  lead_created:          'bg-violet-50 border-violet-200 text-violet-700',
  order_delivered:       'bg-orange-50 border-orange-200 text-orange-700',
};

const TRIGGER_LABEL: Record<TriggerEvent, string> = {
  contact_created:       'Contact onboarded',
  conversation_resolved: 'Conversation resolved',
  lead_created:          'Lead flagged',
  order_delivered:       'Order delivered',
};

const BOT_OPTIONS = [
  { value: 'sales_bot',     label: 'Sales Bot'     },
  { value: 'support_bot',   label: 'Support Bot'   },
  { value: 'lifecycle_bot', label: 'Lifecycle Bot' },
];

const DEFAULT_TEMPLATES: Record<TriggerEvent, string> = {
  contact_created:
    "Hi {name}! 👋 It's been a few days since we connected. We'd love to help you get the most out of our service. Reply with any questions — or here's a special offer just for you: use code WELCOME10 for 10% off your first order!",
  conversation_resolved:
    "Hi {name}, hope we were able to help! If you'd like to share feedback or need anything else, we're here. As a thank-you, enjoy 15% off your next purchase with code THANKS15 — valid for 48 hours.",
  lead_created:
    "Hi {name}! Our team noticed your interest and we'd love to make it easy for you to move forward. Here's an exclusive offer: get a free consultation or a special discount when you place an order this week. Reply YES to claim it!",
  order_delivered:
    "Hi {name}! 🎉 We hope you're loving your order! If you'd like to reorder or explore other products, just reply here. As a thank-you, use code LOYAL10 for 10% off your next purchase — valid for 7 days.",
};

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  name:             string;
  product_slug:     string;
  trigger_event:    TriggerEvent;
  delay_days:       number;
  message_template: string;
}

const BLANK_FORM: FormState = {
  name:             '',
  product_slug:     'sales_bot',
  trigger_event:    'contact_created',
  delay_days:       3,
  message_template: DEFAULT_TEMPLATES['contact_created'],
};

// ─── Sequence Card ──────────────────────────────────────────────────────────────

function SequenceCard({
  seq,
  onToggle,
  onDelete,
  onSave,
}: {
  seq:      LifecycleSequence;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onSave:   (id: string, data: Partial<FormState>) => Promise<void>;
}) {
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<FormState>({
    name:             seq.name,
    product_slug:     seq.product_slug,
    trigger_event:    seq.trigger_event,
    delay_days:       seq.delay_days,
    message_template: seq.message_template,
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  const trig   = TRIGGER_OPTIONS.find(t => t.value === seq.trigger_event)!;
  const colors = TRIGGER_COLORS[seq.trigger_event];

  function handleSave() {
    setError(null);
    startTransition(async () => {
      await onSave(seq.id, form);
      setEditing(false);
    });
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${seq.enabled ? 'border-emerald-200' : 'border-slate-100'}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="text-slate-400">
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-800 truncate">{seq.name}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colors}`}>
                {TRIGGER_LABEL[seq.trigger_event]}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <Clock size={10} />
                {seq.delay_days}d after trigger
              </span>
            </div>
          </div>
        </button>

        {/* Toggle */}
        <button
          onClick={() => onToggle(seq.id, !seq.enabled)}
          disabled={isPending}
          className="shrink-0"
          title={seq.enabled ? 'Disable' : 'Enable'}
        >
          {seq.enabled
            ? <ToggleRight size={22} className="text-emerald-500" />
            : <ToggleLeft  size={22} className="text-slate-300" />
          }
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(seq.id)}
          disabled={isPending}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors shrink-0"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Expandable body */}
      {open && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4">
          {!editing ? (
            <>
              <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Message template</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{seq.message_template}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="bg-slate-100 rounded-md px-2 py-0.5 font-mono">{'{name}'}</span>
                <span>→ replaced with contact&apos;s first name</span>
              </div>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold hover:underline"
              >
                <Edit3 size={12} />
                Edit
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Sequence name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Trigger event</label>
                  <select
                    value={form.trigger_event}
                    onChange={e => setForm(f => ({ ...f, trigger_event: e.target.value as TriggerEvent }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    {TRIGGER_OPTIONS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Days after trigger</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={form.delay_days}
                    onChange={e => setForm(f => ({ ...f, delay_days: Math.max(1, Number(e.target.value)) }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Message template</label>
                <textarea
                  rows={5}
                  value={form.message_template}
                  onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                  placeholder="Hi {name}, ..."
                />
                <p className="text-[11px] text-slate-400 mt-1">Use <code className="bg-slate-100 px-1 rounded">{'{name}'}</code> for the contact&apos;s first name.</p>
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                >
                  <Save size={12} />
                  Save changes
                </button>
                <button
                  onClick={() => { setEditing(false); setForm({ name: seq.name, product_slug: seq.product_slug, trigger_event: seq.trigger_event, delay_days: seq.delay_days, message_template: seq.message_template }); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-slate-500 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={12} />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Sequence Form ──────────────────────────────────────────────────────────

function AddSequenceForm({
  activeSlugs,
  onCreated,
  onCancel,
}: {
  activeSlugs: string[];
  onCreated:   (seq: LifecycleSequence) => void;
  onCancel:    () => void;
}) {
  const botOpts = BOT_OPTIONS.filter(b => activeSlugs.includes(b.value));
  const [form, setForm]              = useState<FormState>({ ...BLANK_FORM, product_slug: botOpts[0]?.value ?? 'sales_bot' });
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  function handleTriggerChange(event: TriggerEvent) {
    setForm(f => ({ ...f, trigger_event: event, message_template: DEFAULT_TEMPLATES[event] }));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await createLifecycleSequence(form);
      if (res.error) { setError(res.error); return; }
      onCreated(res.sequence!);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Plus size={14} className="text-emerald-600" />
        <h3 className="text-sm font-semibold text-slate-800">New lifecycle sequence</h3>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">Sequence name</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. 3-Day Welcome Discount"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Bot</label>
          <select
            value={form.product_slug}
            onChange={e => setForm(f => ({ ...f, product_slug: e.target.value }))}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {botOpts.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            {botOpts.length === 0 && <option value="sales_bot">Sales Bot</option>}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Days after trigger</label>
          <input
            type="number"
            min={1}
            max={365}
            value={form.delay_days}
            onChange={e => setForm(f => ({ ...f, delay_days: Math.max(1, Number(e.target.value)) }))}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>
      </div>

      {/* Trigger event selector — card-style */}
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-2 block">Trigger event</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TRIGGER_OPTIONS.map(t => {
            const active = form.trigger_event === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => handleTriggerChange(t.value)}
                className={`text-left rounded-xl border p-3 transition-all ${
                  active
                    ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">{t.icon}<span className="text-xs font-semibold text-slate-700">{t.label}</span></div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">Message template</label>
        <textarea
          rows={5}
          value={form.message_template}
          onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
          placeholder="Hi {name}, ..."
        />
        <p className="text-[11px] text-slate-400 mt-1">
          Use <code className="bg-slate-100 px-1 rounded">{'{name}'}</code> for the contact&apos;s first name. Write the full WhatsApp message including any coupon codes or expiry info.
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={isPending || !form.name.trim() || !form.message_template.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
        >
          <Save size={13} />
          Create sequence
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-500 font-semibold rounded-lg hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main Tab ───────────────────────────────────────────────────────────────────

export function LifecycleSequencesTab({
  initialSequences,
  activeSlugs,
}: {
  initialSequences: LifecycleSequence[];
  activeSlugs:      string[];
}) {
  const [sequences, setSequences]    = useState<LifecycleSequence[]>(initialSequences);
  const [showForm, setShowForm]      = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleToggle(id: string, enabled: boolean) {
    setSequences(prev => prev.map(s => s.id === id ? { ...s, enabled } : s));
    startTransition(async () => {
      const res = await toggleLifecycleSequence(id, enabled);
      if (res.error) {
        setSequences(prev => prev.map(s => s.id === id ? { ...s, enabled: !enabled } : s));
      }
    });
  }

  function handleDelete(id: string) {
    const snapshot = sequences;
    setSequences(prev => prev.filter(s => s.id !== id));
    startTransition(async () => {
      const res = await deleteLifecycleSequence(id);
      if (res.error) setSequences(snapshot);
    });
  }

  async function handleSave(id: string, data: Partial<FormState>) {
    const res = await updateLifecycleSequence(id, data);
    if (!res.error) {
      setSequences(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    }
  }

  return (
    <div className="space-y-4">
      {/* Explainer */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
        <MessageSquare size={14} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="space-y-1 text-xs text-amber-700">
          <p className="font-semibold text-amber-800">How lifecycle sequences work</p>
          <ul className="list-disc ml-3 space-y-1 leading-relaxed">
            <li>Each sequence fires <strong>one WhatsApp message</strong> a set number of days after a trigger event</li>
            <li>Every contact receives each sequence <strong>once only</strong> — duplicates are automatically suppressed</li>
            <li>Only contacts created <strong>after the sequence was configured</strong> are eligible</li>
            <li>Create multiple sequences at different delays — e.g. Day 3 coupon + Day 7 re-engagement</li>
          </ul>
        </div>
      </div>

      {/* Sequence list */}
      {sequences.length > 0 && (
        <div className="space-y-2">
          {sequences.map(seq => (
            <SequenceCard
              key={seq.id}
              seq={seq}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onSave={handleSave}
            />
          ))}
        </div>
      )}

      {sequences.length === 0 && !showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-12 text-center">
          <Clock size={24} className="text-gray-300 mb-3" />
          <p className="text-sm font-semibold text-gray-500">No sequences configured</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs">
            Create your first lifecycle sequence to automatically follow up with contacts or send them time-limited offers.
          </p>
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <AddSequenceForm
          activeSlugs={activeSlugs}
          onCreated={seq => { setSequences(prev => [...prev, seq]); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-emerald-300 rounded-2xl text-sm font-semibold text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50 transition-colors disabled:opacity-40"
        >
          <Plus size={14} />
          Add sequence
        </button>
      )}
    </div>
  );
}
