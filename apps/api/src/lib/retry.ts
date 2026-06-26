/** Resolves after `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?:  number;
  onRetry?:      (attempt: number, error: string) => void;
}

/**
 * Retry an async operation with exponential backoff.
 * Retries on any thrown error or when `isFailure(result)` returns true.
 */
export async function withRetry<T>(
  fn:         () => Promise<T>,
  isFailure:  (result: T) => boolean,
  options:    RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, onRetry } = options;

  let lastResult!: T;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastResult = await fn();
      if (!isFailure(lastResult)) return lastResult;

      if (attempt < maxAttempts) {
        onRetry?.(attempt, 'result indicated failure');
        await sleep(baseDelayMs * Math.pow(2, attempt - 1));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (attempt === maxAttempts) throw err;
      onRetry?.(attempt, errMsg);
      await sleep(baseDelayMs * Math.pow(2, attempt - 1));
    }
  }

  return lastResult;
}
