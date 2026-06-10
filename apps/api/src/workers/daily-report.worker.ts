import { Worker } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import { runDailyReports } from '../lib/email/daily-report.js';

export function startDailyReportWorker(): Worker {
  const worker = new Worker(
    'daily-reports',
    async (job) => {
      console.log(`[DailyReport] Running job ${job.id}`);
      await runDailyReports();
      console.log(`[DailyReport] Job ${job.id} complete`);
    },
    {
      connection: getRedis(),
      concurrency: 1,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[DailyReport] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
