// Dynamically import @sentry/node so the server starts cleanly even if the
// package hasn't been installed yet (add @sentry/node as a dep when ready).
interface SentryLike {
  init(opts: {
    dsn: string;
    environment?: string;
    tracesSampleRate?: number;
  }): void;
  captureException(err: unknown, ctx?: { extra?: Record<string, unknown> }): void;
  captureMessage(msg: string, ctx?: { extra?: Record<string, unknown> }): void;
}

let _Sentry: SentryLike | null = null;

async function loadSentry() {
  if (_Sentry) return _Sentry;
  try {
    _Sentry = await import('@sentry/node' as string) as SentryLike;
  } catch {
    // Package not installed — fall through to console fallback
  }
  return _Sentry;
}

export function initSentry(): void {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;

  void loadSentry().then(S => {
    S?.init({
      dsn,
      environment: process.env['NODE_ENV'] ?? 'development',
      tracesSampleRate: 0.1,
    });
  });
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env['SENTRY_DSN'] || !_Sentry) {
    console.error('[Error]', err instanceof Error ? err.message : String(err), context ?? '');
    return;
  }
  _Sentry.captureException(err, { extra: context });
}

export function captureMessage(message: string, context?: Record<string, unknown>): void {
  if (!process.env['SENTRY_DSN'] || !_Sentry) {
    console.warn('[Warn]', message, context ?? '');
    return;
  }
  _Sentry.captureMessage(message, { extra: context });
}
