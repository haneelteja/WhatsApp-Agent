'use client';

import { useActionState } from 'react';
import { sendTeamInviteAction } from '@/app/actions/tenant-team';
import { UserPlus } from 'lucide-react';

export function TeamInviteForm() {
  const [state, formAction, pending] = useActionState(sendTeamInviteAction, null);

  return (
    <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <UserPlus size={14} />
        Invite a team member
      </h3>
      <form action={formAction} className="flex flex-col sm:flex-row gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="colleague@email.com"
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
        <select
          name="role"
          defaultValue="agent"
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
        >
          <option value="agent">Agent</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {pending ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      {state?.error && (
        <p className="text-xs text-red-500 mt-2">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs text-emerald-600 mt-2">Invite sent successfully!</p>
      )}
    </div>
  );
}
