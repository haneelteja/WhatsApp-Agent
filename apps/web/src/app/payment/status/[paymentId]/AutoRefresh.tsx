'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.refresh(), 4000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <p className="text-xs text-slate-400 mt-4">
      Checking status automatically…
    </p>
  );
}
