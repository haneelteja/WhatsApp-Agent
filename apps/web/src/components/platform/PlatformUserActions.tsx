'use client';

import { useState, useTransition } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { updatePlatformUserRoleAction, removePlatformUserAction } from '@/app/actions/platform-team';

interface Props {
  userId:      string;
  currentRole: 'manager' | 'admin';
  isSelf:      boolean;
}

export function PlatformUserActions({ userId, currentRole, isSelf }: Props) {
  const [pending, startTransition] = useTransition();
  const [role,    setRole]         = useState(currentRole);
  const [error,   setError]        = useState<string | null>(null);

  function handleRoleChange(newRole: 'manager' | 'admin') {
    if (newRole === role) return;
    setError(null);
    startTransition(async () => {
      const res = await updatePlatformUserRoleAction(userId, newRole);
      if ('error' in res && res.error) setError(res.error);
      else setRole(newRole);
    });
  }

  function handleRemove() {
    if (!confirm('Remove this team member? They will lose platform access immediately.')) return;
    setError(null);
    startTransition(async () => {
      const res = await removePlatformUserAction(userId);
      if ('error' in res && res.error) setError(res.error);
    });
  }

  if (isSelf) {
    return (
      <span className="text-[11px] text-slate-400 italic">You</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] text-red-500">{error}</span>}
      <div className="relative">
        <select
          value={role}
          disabled={pending}
          onChange={e => handleRoleChange(e.target.value as 'manager' | 'admin')}
          className="appearance-none text-xs font-medium border border-slate-200 rounded-lg pl-2.5 pr-6 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white disabled:opacity-50 cursor-pointer"
        >
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
        </select>
        <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
      <button
        type="button"
        onClick={handleRemove}
        disabled={pending}
        title="Remove team member"
        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
