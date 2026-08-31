'use client';

import { useEffect } from 'react';
import { logError } from '@/lib/logger';

export function GlobalErrorInit() {
  useEffect(() => {
    // Catch synchronous runtime errors not caught by React (e.g. outside render)
    const onError = (event: ErrorEvent) => {
      logError(event.error ?? new Error(event.message), {
        layer:  'Runtime',
        source: 'GlobalErrorInit',
        meta: {
          filename: event.filename,
          lineno:   event.lineno,
          colno:    event.colno,
        },
      });
    };

    // Catch unhandled async rejections (forgotten .catch(), useEffect async leaks)
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      logError(reason instanceof Error ? reason : new Error(String(reason)), {
        layer:  'Runtime',
        source: 'GlobalErrorInit',
        fn:     'unhandledrejection',
        meta: { reason: String(reason) },
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
