'use client';

import { useState, useTransition } from 'react';
import { useRouter }               from 'next/navigation';
import { Trash2 }                  from 'lucide-react';
import { deleteContactGroup }      from '@/app/actions/contact-groups';

export function GroupDeleteButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [confirm,  setConfirm]  = useState(false);
  const [pending,  startTransition] = useTransition();
  const router = useRouter();

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600">Delete &ldquo;{groupName}&rdquo;?</span>
        <button
          type="button"
          onClick={() => startTransition(async () => {
            await deleteContactGroup(groupId);
            router.push('/groups');
          })}
          disabled={pending}
          className="text-xs font-semibold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
        >
          {pending ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button type="button" onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className="p-2 rounded-lg hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors"
      title="Delete group"
    >
      <Trash2 size={14} />
    </button>
  );
}
