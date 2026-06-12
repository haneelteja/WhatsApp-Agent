'use client';

import { useState, useTransition } from 'react';
import { Pencil, X, Check } from 'lucide-react';
import { toggleNotificationAction, updateNotificationRecipientsAction } from '@/app/actions/notifications';

type Recipient = { role?: string; email?: string };

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'platform_manager', label: 'Platform Manager' },
  { value: 'platform_admin',   label: 'Platform Admin'   },
  { value: 'client_manager',   label: 'Client Manager'   },
  { value: 'client_admin',     label: 'Client Admin'     },
];

const ROLE_BADGE: Record<string, string> = {
  platform_manager: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  platform_admin:   'bg-slate-100 text-slate-600 border-slate-200',
  client_manager:   'bg-violet-50 text-violet-700 border-violet-200',
  client_admin:     'bg-sky-50 text-sky-700 border-sky-200',
};

interface Props {
  id:         string;
  label:      string;
  desc:       string;
  enabled:    boolean;
  recipients: Recipient[];
}

export function NotificationToggleRow({ id, label, desc, enabled: initEnabled, recipients: initRecipients }: Props) {
  const [pending,    startTransition] = useTransition();
  const [enabled,    setEnabled]      = useState(initEnabled);
  const [recipients, setRecipients]   = useState<Recipient[]>(initRecipients);
  const [editing,    setEditing]      = useState(false);
  const [customEmail, setCustomEmail] = useState('');

  // Which roles are currently checked
  const checkedRoles = new Set(recipients.filter(r => r.role).map(r => r.role!));
  const customEmails = recipients.filter(r => r.email).map(r => r.email!);

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await toggleNotificationAction(id, next);
      if ('error' in res && res.error) setEnabled(!next); // revert on error
    });
  }

  function toggleRole(role: string) {
    const next = new Set(checkedRoles);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setRecipients([
      ...Array.from(next).map(r => ({ role: r })),
      ...customEmails.map(e => ({ email: e })),
    ]);
  }

  function addEmail() {
    const e = customEmail.trim().toLowerCase();
    if (!e || customEmails.includes(e)) return;
    const next = [
      ...Array.from(checkedRoles).map(r => ({ role: r })),
      ...customEmails.map(em => ({ email: em })),
      { email: e },
    ];
    setRecipients(next);
    setCustomEmail('');
  }

  function removeEmail(email: string) {
    setRecipients([
      ...Array.from(checkedRoles).map(r => ({ role: r })),
      ...customEmails.filter(e => e !== email).map(e => ({ email: e })),
    ]);
  }

  function saveRecipients() {
    startTransition(async () => {
      await updateNotificationRecipientsAction(id, recipients);
      setEditing(false);
    });
  }

  return (
    <div className={`py-4 px-5 ${!enabled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={pending}
          className={`relative shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-1 ${enabled ? 'bg-indigo-500' : 'bg-slate-200'} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{label}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {enabled ? 'On' : 'Off'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>

          {/* Recipients */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {recipients.length === 0 ? (
              <span className="text-[11px] text-slate-300 italic">No recipients</span>
            ) : recipients.map((r, i) => (
              <span
                key={i}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${r.role ? (ROLE_BADGE[r.role] ?? 'bg-slate-100 text-slate-600 border-slate-200') : 'bg-amber-50 text-amber-700 border-amber-200'}`}
              >
                {r.role ? (ROLE_OPTIONS.find(o => o.value === r.role)?.label ?? r.role) : r.email}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setEditing(v => !v)}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium flex items-center gap-0.5 transition-colors"
            >
              <Pencil size={9} />
              Edit
            </button>
          </div>

          {/* Inline editor */}
          {editing && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                {ROLE_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkedRoles.has(opt.value)}
                      onChange={() => toggleRole(opt.value)}
                      className="w-3.5 h-3.5 rounded text-indigo-500 accent-indigo-500"
                    />
                    <span className="text-xs text-slate-700">{opt.label}</span>
                  </label>
                ))}
              </div>

              {/* Custom emails */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Custom emails</p>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {customEmails.map(e => (
                    <span key={e} className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                      {e}
                      <button type="button" onClick={() => removeEmail(e)} className="text-amber-500 hover:text-amber-700">
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="email"
                    value={customEmail}
                    onChange={e => setCustomEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                    placeholder="email@example.com"
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button
                    type="button"
                    onClick={addEmail}
                    className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveRecipients}
                  disabled={pending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Check size={11} />
                  {pending ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
