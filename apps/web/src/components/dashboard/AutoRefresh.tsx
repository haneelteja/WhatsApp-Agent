'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Silently calls router.refresh() on an interval while `active` is true.
 * Use this on pages that show live data (voice calls in progress, etc.)
 * so the server-rendered content stays up to date without a manual reload.
 */
export function AutoRefresh({ active, intervalMs = 8000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
