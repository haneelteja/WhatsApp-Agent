'use client';

import { useState, useTransition } from 'react';
import { UserPlus, Mail, Check } from 'lucide-react';
import { invitePlatformUserAction } from '@/app/actions/platform-team';

export function InvitePlatformUserForm() {
  const [pending, startTransition] = useTransition();
  const [email,   setEmail]  = useState('');
  const [role,    setRole]   = useState<'manager' | 'admin'>('admin');
  const [sent,    setSent]   = useState(false);
  const [error,   setError]  = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    startTransition(async () => {
      const res = await invitePlatformUserAction(email.trim().toLowerCase(), role);
      if ('error' in res && res.error) {
        setError(res.error);
      } else {
        setSent(true);
        setEmail('');
        setTimeout(() => setSent(false), 4000);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="colleague@yourcompany.com"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value as 'manager' | 'admin')}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
        >
          <UserPlus size={14} />
          {pending ? 'Inviting…' : 'Send Invite'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {sent && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <Check size={11} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Invite sent!</p>
            <p className="text-xs text-emerald-600">They&apos;ll receive a magic-link email to set up their account.</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
        <Mail size={11} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500">
          <strong>Admin</strong> — can view and configure everything.{' '}
          <strong>Manager</strong> — full access including inviting other platform users.
        </p>
      </div>
    </form>
  );
}
