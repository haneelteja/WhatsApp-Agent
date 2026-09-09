'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { CopilotMessage } from './CopilotWidget';

// Load CopilotWidget only after hydration is complete.
// dynamic({ ssr: false }) creates an internal React.lazy() Suspense boundary that
// doesn't exist in server HTML — if it's in the tree during hydration it triggers
// React error #418 via the lZ-at-63272 path. Gating on `mounted` keeps it out of
// the tree entirely until after hydration, then introduces it as a pure client update.
const CopilotWidgetLazy = dynamic(
  () => import('./CopilotWidget').then(m => ({ default: m.CopilotWidget })),
  { ssr: false },
);

export function CopilotWidgetMount({ initialMessages }: { initialMessages: CopilotMessage[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <CopilotWidgetLazy initialMessages={initialMessages} />;
}
