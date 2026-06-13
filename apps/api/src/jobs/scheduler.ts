import { getRedis } from '../lib/redis.js';
import { getDailyReportQueue, getFollowUpQueue } from '../lib/queues.js';
import { getServerClient } from '@alphabot/database';

const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function pingServices(): Promise<void> {
  // Ping Supabase — prevents free-tier project from pausing (pauses after 7 days inactivity)
  try {
    await getServerClient().from('tenants').select('id').limit(1);
    console.log('[KeepAlive] Supabase OK');
  } catch {
    console.warn('[KeepAlive] Supabase ping failed');
  }

  // Ping Redis — prevents Upstash data expiry (expires after 7 days inactivity)
  try {
    await getRedis().ping();
    console.log('[KeepAlive] Redis OK');
  } catch {
    console.warn('[KeepAlive] Redis ping failed');
  }
}

export async function startScheduler(): Promise<void> {
  // ── Keep-alive ────────────────────────────────────────────────────────────
  // Runs immediately on startup, then every 4 hours.
  // External pinger (UptimeRobot / cron-job.org hitting /health every 5 min)
  // keeps the Render process alive so these intervals actually fire.
  void pingServices();
  setInterval(() => void pingServices(), KEEP_ALIVE_INTERVAL_MS);

  // ── Daily report schedule ─────────────────────────────────────────────────
  // Schedule a BullMQ repeatable job for 08:00 UTC daily.
  // Falls back gracefully if Redis is unavailable.
  try {
    const queue = getDailyReportQueue();
    await queue.upsertJobScheduler(
      'daily-report-8am-utc',
      { pattern: '0 8 * * *', tz: 'UTC' },
      { name: 'daily-report', data: {} }
    );
    console.log('[Scheduler] Daily report job scheduled (08:00 UTC)');
  } catch (err) {
    console.warn('[Scheduler] Could not schedule daily report (Redis unavailable?):', (err as Error).message);
  }

  // ── Follow-up schedule ────────────────────────────────────────────────────
  // Runs every hour to find idle conversations and send configured follow-ups.
  try {
    const fuQueue = getFollowUpQueue();
    await fuQueue.upsertJobScheduler(
      'follow-up-hourly',
      { every: 60 * 60 * 1000 },  // every 60 minutes
      { name: 'follow-up', data: {} }
    );
    console.log('[Scheduler] Follow-up job scheduled (every 60 min)');
  } catch (err) {
    console.warn('[Scheduler] Could not schedule follow-up (Redis unavailable?):', (err as Error).message);
  }
}
