'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { cancelScheduledMessageAction } from '@/app/actions/scheduled-messages';

export function ScheduledMessageActions({ id, status }: { id: string; status: string }) {
  const [cancelling, setCancelling] = useState(false);
  const router = useRouter();

  const canEdit   = status === 'scheduled' || status === 'draft';
  const canCancel = !['completed', 'cancelled', 'running'].includes(status);

  async function handleCancel() {
    if (!confirm('Cancel this scheduled message? This cannot be undone.')) return;
    setCancelling(true);
    await cancelScheduledMessageAction(id);
    router.refresh();
    setCancelling(false);
  }

  return (
    <div className="flex items-center gap-1">
      {canEdit && (
        <Link
          href={`/scheduled-messages/${id}/edit`}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title="Edit"
        >
          <Pencil size={13} />
        </Link>
      )}
      {canCancel && (
        <button
          type="button"
          onClick={() => void handleCancel()}
          disabled={cancelling}
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Cancel"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
