/**
 * Business-days arithmetic (Mon–Fri). Weekends are skipped.
 * Public holidays are deliberately not modelled — use addBusinessDays for
 * follow-up timing so weekends don't count as silence days.
 */

/** Returns the number of business days between two dates (exclusive of start, inclusive of end). */
export function businessDaysBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  cur.setDate(cur.getDate() + 1); // exclusive of start
  while (cur <= endDay) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Returns a new Date that is `days` business days after `start`. */
export function addBusinessDays(start: Date, days: number): Date {
  if (days <= 0) return new Date(start);
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

/**
 * Returns the cutoff timestamp `businessDays` business days ago.
 * Use instead of `Date.now() - days * 86400000` for follow-up cutoffs.
 */
export function businessDaysCutoff(businessDays: number): string {
  const now = new Date();
  let subtracted = 0;
  while (subtracted < businessDays) {
    now.setDate(now.getDate() - 1);
    const day = now.getDay();
    if (day !== 0 && day !== 6) subtracted++;
  }
  return now.toISOString();
}
