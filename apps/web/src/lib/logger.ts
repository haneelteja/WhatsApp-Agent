const APP_TAG = '[ALPHABOT]';

export type ErrorLayer = 'UI' | 'API' | 'Network' | 'Component' | 'Runtime';

export interface ErrorContext {
  layer:      ErrorLayer;
  source:     string;
  component?: string;
  fn?:        string;
  endpoint?:  string;
  params?:    Record<string, unknown>;
  meta?:      Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'accesstoken', 'authorization',
  'secret', 'apikey', 'api_key', 'access_token',
]);

function sanitize(obj?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) =>
      [k, SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : v],
    ),
  );
}

export function logError(error: unknown, context: ErrorContext): void {
  const err       = error instanceof Error ? error : new Error(String(error));
  const timestamp = new Date().toISOString();
  const endpoint  = context.endpoint ? ` — ${context.endpoint}` : '';
  const label     = `${APP_TAG} [${context.layer}] ${context.source}${endpoint}`;

  // Never log in test environments
  if (typeof process !== 'undefined' && process.env['NODE_ENV'] === 'test') return;

  console.groupCollapsed(`%c${label}`, 'color:#EF4444;font-weight:700');
  console.error({
    errorType:  err.name,
    layer:      context.layer,
    source:     context.source,
    component:  context.component,
    function:   context.fn,
    endpoint:   context.endpoint,
    params:     sanitize(context.params),
    timestamp,
    message:    err.message,
    stackTrace: err.stack,
    ...context.meta,
  });
  console.groupEnd();
}

export function logWarn(message: string, context: Omit<ErrorContext, 'layer'>): void {
  if (typeof process !== 'undefined' && process.env['NODE_ENV'] === 'test') return;
  console.warn(`${APP_TAG} [WARN] ${context.source}:`, message, context.meta ?? {});
}
