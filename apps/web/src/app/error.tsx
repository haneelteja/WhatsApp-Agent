'use client';
import { useEffect } from 'react';
import { captureException } from '@/lib/sentry';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[RootError]', error.digest, error.message);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="rounded-2xl border border-red-100 bg-white p-8 shadow-sm text-center max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Something went wrong</h2>
        <p className="text-xs text-gray-500 mb-4">
          {error.digest ? `Error ID: ${error.digest}` : 'An unexpected error occurred.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
