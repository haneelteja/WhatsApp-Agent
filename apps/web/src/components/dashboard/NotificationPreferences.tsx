'use client';

import { useState, useTransition } from 'react';
import { Check, Bell } from 'lucide-react';
import { saveNotificationPrefsAction, type UserNotificationPrefs } from '@/app/actions/notification-prefs';

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked:  boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-150 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function NotificationPreferences({
  initial,
}: {
  initial: UserNotificationPrefs;
}) {
  const [prefs, setPrefs]   = useState<UserNotificationPrefs>(initial);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');
  const [isPending, startT] = useTransition();

  function handleChange(key: keyof UserNotificationPrefs, val: boolean) {
    setPrefs(p => ({ ...p, [key]: val }));
    setSaved(false);
    setError('');
  }

  function save() {
    setError('');
    startT(async () => {
      const res = await saveNotificationPrefsAction(prefs);
      if (res.error) { setError(res.error); return; }
      setSaved(true);
    });
  }

  const PREF_ROWS: { key: keyof UserNotificationPrefs; label: string; description: string }[] = [
    {
      key:         'escalation_email',
      label:       'Escalation alerts',
      description: 'Email me when a conversation is escalated to a human agent.',
    },
    {
      key:         'assignment_email',
      label:       'Assignment alerts',
      description: 'Email me when a conversation is assigned to me.',
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
      {PREF_ROWS.map(row => (
        <div key={row.key} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">{row.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{row.description}</p>
          </div>
          <Toggle
            checked={prefs[row.key]}
            onChange={val => handleChange(row.key, val)}
            disabled={isPending}
          />
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gray-50/60">
        {error && <p className="text-xs text-red-500 flex-1">{error}</p>}
        {saved && !error && (
          <p className="text-xs text-emerald-600 flex items-center gap-1 flex-1">
            <Check size={11} /> Saved
          </p>
        )}
        {!saved && !error && <span className="flex-1" />}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 shrink-0"
        >
          {isPending ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}
