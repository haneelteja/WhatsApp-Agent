'use client';

import { useState, useTransition } from 'react';
import { Send, Clock, Users, Tag, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { createBroadcast } from '@/app/actions/broadcasts';

type GroupOption = { id: string; name: string; color: string; emoji: string };

type AudienceType = 'all' | 'recent_7d' | 'recent_10d' | 'groups';

const AUDIENCE_OPTIONS: { value: AudienceType; label: string; desc: string }[] = [
  { value: 'all',       label: 'All contacts',       desc: 'Every contact in your account' },
  { value: 'recent_7d', label: 'Active last 7 days',  desc: 'Contacts with activity in the last week' },
  { value: 'recent_10d',label: 'Active last 10 days', desc: 'Contacts with activity in the last 10 days' },
  { value: 'groups',    label: 'Specific groups',     desc: 'Target one or more contact groups' },
];

export function BroadcastCreateForm({
  allGroups,
  onCreated,
}: {
  allGroups:  GroupOption[];
  onCreated?: () => void;
}) {
  const [name,         setName]         = useState('');
  const [message,      setMessage]      = useState('');
  const [audience,     setAudience]     = useState<AudienceType>('all');
  const [selectedGrps, setSelectedGrps] = useState<string[]>([]);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledAt,  setScheduledAt]  = useState('');
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);
  const [pending,      startTransition] = useTransition();

  const MAX_CHARS = 1024;
  const charsLeft = MAX_CHARS - message.length;

  function toggleGroup(id: string) {
    setSelectedGrps(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id],
    );
  }

  function handleSubmit() {
    if (!name.trim())    { setError('Broadcast name is required.'); return; }
    if (!message.trim()) { setError('Message is required.'); return; }
    if (message.length > MAX_CHARS) { setError(`Message too long (${message.length}/${MAX_CHARS}).`); return; }
    if (audience === 'groups' && selectedGrps.length === 0) {
      setError('Select at least one group.'); return;
    }
    if (scheduleMode === 'later' && !scheduledAt) {
      setError('Pick a scheduled date and time.'); return;
    }

    const scheduledIso = scheduleMode === 'later'
      ? new Date(scheduledAt).toISOString()
      : null;

    setError(null);
    startTransition(async () => {
      const result = await createBroadcast(name, message, audience, selectedGrps, scheduledIso);
      if (result.error) { setError(result.error); return; }
      setSuccess(true);
      setName(''); setMessage(''); setAudience('all'); setSelectedGrps([]);
      setScheduleMode('now'); setScheduledAt('');
      onCreated?.();
      setTimeout(() => setSuccess(false), 3000);
    });
  }

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
          Broadcast name *
        </label>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setError(null); }}
          placeholder="e.g. Diwali Offer 2024"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-gray-300"
        />
      </div>

      {/* Message */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Message *
          </label>
          <span className={`text-[10px] font-medium ${charsLeft < 100 ? 'text-orange-500' : 'text-gray-400'}`}>
            {charsLeft} left
          </span>
        </div>
        <textarea
          value={message}
          onChange={e => { setMessage(e.target.value); setError(null); }}
          placeholder={"Hi {name}! 🎉 We have a special offer just for you...\n\nUse {name} to personalise with the customer's first name."}
          rows={5}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-gray-300 resize-none"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          Use <code className="bg-gray-100 px-1 rounded">{'{name}'}</code> to insert the contact&apos;s first name.
        </p>
      </div>

      {/* Audience */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
          Audience *
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AUDIENCE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setAudience(opt.value); setError(null); }}
              className={`flex items-start gap-2.5 text-left px-3.5 py-3 rounded-xl border text-sm transition-all ${
                audience === opt.value
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                  : 'border-gray-200 text-gray-600 hover:border-emerald-200 hover:bg-emerald-50/50'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
                audience === opt.value ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
              }`}>
                {audience === opt.value && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
              </div>
              <div>
                <p className="font-semibold text-xs">{opt.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Group selector */}
        {audience === 'groups' && allGroups.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {allGroups.map(g => {
              const sel = selectedGrps.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all"
                  style={sel
                    ? { backgroundColor: g.color + '20', borderColor: g.color, color: g.color }
                    : { backgroundColor: 'white', borderColor: '#e5e7eb', color: '#6b7280' }
                  }
                >
                  {g.emoji} {g.name}
                  {sel && <span className="ml-0.5">✓</span>}
                </button>
              );
            })}
          </div>
        )}
        {audience === 'groups' && allGroups.length === 0 && (
          <p className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
            No groups yet. <a href="/groups" className="font-semibold underline">Create a group</a> first.
          </p>
        )}
      </div>

      {/* Schedule */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
          When to send
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScheduleMode('now')}
            className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl border font-medium transition-all ${
              scheduleMode === 'now' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <Send size={13} />
            Send now
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode('later')}
            className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl border font-medium transition-all ${
              scheduleMode === 'later' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <Clock size={13} />
            Schedule
          </button>
        </div>

        {scheduleMode === 'later' && (
          <input
            type="datetime-local"
            value={scheduledAt}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            onChange={e => { setScheduledAt(e.target.value); setError(null); }}
            className="mt-2 text-sm border border-gray-200 rounded-xl px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full sm:w-auto"
          />
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 font-medium">
          ✓ Broadcast {scheduleMode === 'later' ? 'scheduled' : 'queued'} successfully.
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
      >
        {scheduleMode === 'later' ? <Clock size={14} /> : <Send size={14} />}
        {pending
          ? 'Saving…'
          : scheduleMode === 'later'
          ? 'Schedule broadcast'
          : 'Send broadcast'}
      </button>
    </div>
  );
}
