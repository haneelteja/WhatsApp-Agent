/**
 * Sentry client-side error tracking wrapper.
 *
 * To activate:
 *   1. npm install @sentry/nextjs --workspace=@alphabot/web
 *   2. Add NEXT_PUBLIC_SENTRY_DSN to apps/web/.env.local
 *   3. Uncomment the Sentry.init block below and the import.
 */

// import * as Sentry from '@sentry/nextjs';

export function initSentry(): void {
  const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];
  if (!dsn) return;
  // Sentry.init({ dsn, tracesSampleRate: 0.05 });
}

export function captureException(err: unknown): void {
  if (process.env['NEXT_PUBLIC_SENTRY_DSN']) {
    // Sentry.captureException(err);
  }
  console.error('[ClientError]', err instanceof Error ? err.message : String(err));
}
