import type { FastifyBaseLogger } from 'fastify';

/**
 * Fire-and-forget wrapper that logs failures instead of silently swallowing them.
 * Use instead of bare `void promise` so transient errors are observable.
 */
export function fireForget(
  p: Promise<unknown>,
  label: string,
  log: Pick<FastifyBaseLogger, 'warn'>,
): void {
  p.catch((err: unknown) => {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), label },
      `[fireForget] ${label} failed — non-blocking, continuing`,
    );
  });
}
