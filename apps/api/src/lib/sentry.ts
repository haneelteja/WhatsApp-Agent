/**
 * Sentry error tracking — lightweight wrapper so the rest of the codebase
 * doesn't import @sentry/node directly.
 *
 * To activate:
 *   1. npm install @sentry/node --workspace=@alphabot/api
 *   2. Add SENTRY_DSN to apps/api/.env
 *   3. Uncomment the Sentry.init block below.
 */

// import * as Sentry from '@sentry/node';

export function initSentry(): void {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;

  // Sentry.init({
  //   dsn,
  //   environment: process.env['NODE_ENV'] ?? 'development',
  //   tracesSampleRate: 0.1,
  // });
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env['SENTRY_DSN']) {
    // Fallback: structured console log so errors are still visible in Render logs
    console.error('[Error]', err instanceof Error ? err.message : String(err), context ?? '');
    return;
  }
  // Sentry.captureException(err, { extra: context });
}

export function captureMessage(message: string, context?: Record<string, unknown>): void {
  if (!process.env['SENTRY_DSN']) {
    console.warn('[Warn]', message, context ?? '');
    return;
  }
  // Sentry.captureMessage(message, { extra: context });
}
