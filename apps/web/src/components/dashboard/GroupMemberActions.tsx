'use client';

import { useTransition } from 'react';
import { Trash2 }        from 'lucide-react';
import { removeContactFromGroup } from '@/app/actions/contact-groups';

export function GroupMemberActions({
  contactId,
  groupId,
}: {
  contactId: string;
  groupId:   string;
}) {
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      await removeContactFromGroup(contactId, groupId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleRemove}
      disabled={pending}
      title="Remove from group"
      className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors disabled:opacity-40 shrink-0"
    >
      <Trash2 size={13} />
    </button>
  );
}
