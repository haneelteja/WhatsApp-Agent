'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2, PowerOff, Power } from 'lucide-react';
import { setTenantStatusAction, deleteTenantAction } from '@/app/actions/tenant-manage';

interface Props {
  tenantId:    string;
  tenantName:  string;
  status:      'active' | 'trial' | 'suspended';
}

export function ClientDangerZone({ tenantId, tenantName, status }: Props) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText]     = useState('');
  const [error, setError]                 = useState('');
  const [isPending, startTransition]      = useTransition();

  const isSuspended = status === 'suspended';
  const deleteMatch = confirmText.trim() === tenantName.trim();

  function handleSuspend() {
    startTransition(async () => {
      setError('');
      const res = await setTenantStatusAction(tenantId, isSuspended ? 'active' : 'suspended');
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleDelete() {
    if (!deleteMatch) return;
    startTransition(async () => {
      setError('');
      const res = await deleteTenantAction(tenantId);
      if (res?.error) setError(res.error);
      // redirect happens inside server action on success
    });
  }

  return (
    <div className="space-y-4">
      {/* Suspend / Reactivate */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
        <div>
          <p className="text-sm font-semibold text-amber-800">
            {isSuspended ? 'Reactivate client' : 'Suspend client'}
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {isSuspended
              ? 'Restores bot access. The client can log in and send messages again.'
              : 'Blocks bot access and login. No messages will be processed. Reversible.'}
          </p>
        </div>
        <button
          onClick={handleSuspend}
          disabled={isPending}
          className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
            isSuspended
              ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
              : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'
          }`}
        >
          {isSuspended ? <Power size={13} /> : <PowerOff size={13} />}
          {isPending ? 'Saving…' : isSuspended ? 'Reactivate' : 'Suspend'}
        </button>
      </div>

      {/* Delete */}
      <div className="p-4 rounded-xl border border-red-200 bg-red-50 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Delete client permanently</p>
            <p className="text-xs text-red-700 mt-0.5">
              Deletes the tenant, all conversations, contacts, bots, and auth accounts.{' '}
              <strong>This cannot be undone.</strong>
            </p>
          </div>
        </div>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-300 bg-white px-4 py-2 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <Trash2 size={13} />
            Delete client
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-red-700 font-medium">
              Type <span className="font-mono font-bold">{tenantName}</span> to confirm:
            </p>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={tenantName}
              className="w-full text-xs border border-red-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400/40 bg-white"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={!deleteMatch || isPending}
                className="flex items-center gap-1.5 text-xs font-bold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                <Trash2 size={13} />
                {isPending ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                onClick={() => { setConfirmDelete(false); setConfirmText(''); }}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
}
