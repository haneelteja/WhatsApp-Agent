'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { PlayCircle, PauseCircle, Ban, Loader2 } from 'lucide-react';

type Props = {
  campaignId: string;
  tenantId:   string;
  status:     string;
  canLaunch:  boolean;
  canPause:   boolean;
  canCancel:  boolean;
};

export function CampaignActions({ campaignId, tenantId, status, canLaunch, canPause, canCancel }: Props) {
  const router   = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [busy, setBusy] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  async function callAction(action: 'launch' | 'pause' | 'cancel') {
    setBusy(action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch(`${apiBase}/api/campaigns/${tenantId}/${campaignId}/${action}`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert((body as { error?: string }).error ?? 'Action failed');
      } else {
        router.refresh();
      }
    } catch {
      alert('Network error — please try again');
    } finally {
      setBusy(null);
    }
  }

  if (!canLaunch && !canPause && !canCancel) return null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      {canLaunch && (
        <button
          type="button"
          onClick={() => callAction('launch')}
          disabled={busy !== null}
          className="flex items-center gap-1.5 text-sm font-medium bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {busy === 'launch' ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
          {status === 'paused' ? 'Resume' : 'Launch'}
        </button>
      )}
      {canPause && (
        <button
          type="button"
          onClick={() => callAction('pause')}
          disabled={busy !== null}
          className="flex items-center gap-1.5 text-sm font-medium bg-amber-100 text-amber-700 px-4 py-2 rounded-xl hover:bg-amber-200 disabled:opacity-50 transition-colors"
        >
          {busy === 'pause' ? <Loader2 size={14} className="animate-spin" /> : <PauseCircle size={14} />}
          Pause
        </button>
      )}
      {canCancel && (
        <button
          type="button"
          onClick={() => {
            if (confirm('Cancel this campaign? This cannot be undone.')) callAction('cancel');
          }}
          disabled={busy !== null}
          className="flex items-center gap-1.5 text-sm font-medium bg-red-50 text-red-600 px-3 py-2 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {busy === 'cancel' ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
          Cancel
        </button>
      )}
    </div>
  );
}
