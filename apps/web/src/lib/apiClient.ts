import { logError } from '@/lib/logger';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiError {
  userMessage: string;
  errorCode:   string;
  httpStatus:  number;
  retryable:   boolean;
}

function isApiError(e: unknown): e is ApiError {
  return typeof e === 'object' && e !== null && 'userMessage' in e && 'httpStatus' in e;
}

const USER_MESSAGES: Record<number, string> = {
  0:   'Unable to connect. Please check your internet connection.',
  401: 'Your session has expired. Please log in again.',
  403: "You don't have permission to do this.",
  404: 'The requested resource was not found.',
  408: 'The request took too long. Please try again.',
  422: 'The submitted data is invalid. Please check your inputs.',
  429: 'Too many requests. Please wait a moment before trying again.',
  500: 'Something went wrong on our end. Please try again shortly.',
  502: 'Service temporarily unavailable. Please try again.',
  503: 'Service temporarily unavailable. Please try again.',
};

const RETRYABLE = new Set([408, 429, 500, 502, 503]);

function buildApiError(status: number, body: Record<string, unknown>): ApiError {
  return {
    userMessage: USER_MESSAGES[status] ?? 'An unexpected error occurred. Please try again.',
    errorCode:   String(body['errorCode'] ?? 'UNKNOWN'),
    httpStatus:  status,
    retryable:   RETRYABLE.has(status),
  };
}

async function request<T>(
  endpoint: string,
  options: RequestInit & { source?: string; component?: string } = {},
): Promise<T> {
  const { source = 'ApiClient', component, ...fetchOpts } = options;
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const method     = fetchOpts.method ?? 'GET';

  try {
    const response = await fetch(endpoint, {
      ...fetchOpts,
      signal:  controller.signal,
      headers: { 'Content-Type': 'application/json', ...fetchOpts.headers },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let body: Record<string, unknown> = {};
      try { body = await response.json(); } catch { /* non-JSON body */ }

      const apiErr = buildApiError(response.status, body);
      logError(new Error(apiErr.userMessage), {
        layer: 'API', source, component,
        endpoint: `${method} ${endpoint}`,
        meta: {
          httpStatus:   response.status,
          errorCode:    body['errorCode'],
          serverDetail: body['details'] ?? body['message'],
        },
      });

      // Redirect to login on session expiry
      if (response.status === 401 && typeof window !== 'undefined') {
        window.location.href = '/login';
      }

      throw apiErr;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      const err = buildApiError(0, { errorCode: 'INVALID_RESPONSE' });
      logError(new Error('Non-JSON API response'), {
        layer: 'API', source, component, endpoint: `${method} ${endpoint}`,
        meta: { contentType },
      });
      throw err;
    }

    return response.json() as Promise<T>;

  } catch (err) {
    clearTimeout(timeoutId);

    if (isApiError(err)) throw err;

    // AbortController timeout
    if (err instanceof DOMException && err.name === 'AbortError') {
      logError(err, {
        layer: 'Network', source, component,
        endpoint: `${method} ${endpoint}`,
        meta: { timeoutMs: DEFAULT_TIMEOUT_MS },
      });
      throw buildApiError(408, { errorCode: 'REQUEST_TIMEOUT' });
    }

    // Network failure (offline, CORS, DNS)
    logError(err, {
      layer: 'Network', source, component,
      endpoint: `${method} ${endpoint}`,
      meta: { online: typeof navigator !== 'undefined' ? navigator.onLine : true },
    });
    throw buildApiError(0, { errorCode: 'NETWORK_ERROR' });
  }
}

export const apiClient = {
  get:    <T>(url: string, opts?: object) =>
              request<T>(url, { method: 'GET', ...opts }),
  post:   <T>(url: string, body: unknown, opts?: object) =>
              request<T>(url, { method: 'POST', body: JSON.stringify(body), ...opts }),
  patch:  <T>(url: string, body: unknown, opts?: object) =>
              request<T>(url, { method: 'PATCH', body: JSON.stringify(body), ...opts }),
  put:    <T>(url: string, body: unknown, opts?: object) =>
              request<T>(url, { method: 'PUT', body: JSON.stringify(body), ...opts }),
  delete: <T>(url: string, opts?: object) =>
              request<T>(url, { method: 'DELETE', ...opts }),
};
