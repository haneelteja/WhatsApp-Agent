import { useState, useCallback, useRef } from 'react';
import { logError } from '@/lib/logger';
import type { ApiError } from '@/lib/apiClient';

interface AsyncState<T> {
  data:      T | null;
  loading:   boolean;
  error:     string | null;
  retryable: boolean;
}

export function useAsync<T>(context: { component: string; fn: string }) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null, loading: false, error: null, retryable: false,
  });
  // Stable ref so context doesn't re-create run()
  const ctxRef = useRef(context);
  ctxRef.current = context;

  const run = useCallback(async (fn: () => Promise<T>): Promise<void> => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      setState({ data, loading: false, error: null, retryable: false });
    } catch (err) {
      const apiErr = err as Partial<ApiError>;
      const userMessage = apiErr.userMessage ?? 'Something went wrong. Please try again.';

      // Only log here if apiClient didn't already log it (apiClient sets httpStatus)
      if (!apiErr.httpStatus) {
        logError(err, {
          layer:     'UI',
          source:    ctxRef.current.component,
          component: ctxRef.current.component,
          fn:        ctxRef.current.fn,
        });
      }

      setState({ data: null, loading: false, error: userMessage, retryable: apiErr.retryable ?? false });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null, retryable: false });
  }, []);

  return { ...state, run, reset };
}
