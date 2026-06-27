import type { FastifyBaseLogger } from 'fastify';

/**
 * Fire-and-forget wrapper that logs failures instead of silently swallowing them.
 * Accepts PromiseLike so Supabase query builders (which are PromiseLike, not full Promises)
 * can be passed directly without calling .then() first.
 */
export function fireForget(
  p: PromiseLike<unknown>,
  label: string,
  log: Pick<FastifyBaseLogger, 'warn'>,
): void {
  Promise.resolve(p).catch((err: unknown) => {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), label },
      `[fireForget] ${label} failed — non-blocking, continuing`,
    );
  });
}
