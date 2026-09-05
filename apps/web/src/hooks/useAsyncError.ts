import { useCallback, useState } from 'react';

/**
 * Bridges async errors into React's error boundary system.
 *
 * Without this, a rejected promise inside a component function body is silently
 * swallowed — the ErrorBoundary never sees it.
 *
 * Usage:
 *   const throwAsync = useAsyncError();
 *
 *   async function loadData() {
 *     try {
 *       const data = await fetchSomething();
 *     } catch (err) {
 *       throwAsync(err);   // → nearest ErrorBoundary catches it
 *     }
 *   }
 */
export function useAsyncError(): (err: unknown) => void {
  const [, setState] = useState<unknown>();

  return useCallback((err: unknown) => {
    setState(() => {
      throw err instanceof Error ? err : new Error(String(err));
    });
  }, []);
}
