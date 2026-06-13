import { Queue } from 'bullmq';
import { getRedis } from './redis.js';

const JOB_OPTIONS = {
  removeOnComplete: 10,
  removeOnFail: 20,
} as const;

let _dailyReportQueue: Queue | null = null;
let _followUpQueue:    Queue | null = null;

export function getDailyReportQueue(): Queue {
  if (_dailyReportQueue) return _dailyReportQueue;
  _dailyReportQueue = new Queue('daily-reports', {
    connection: getRedis(),
    defaultJobOptions: JOB_OPTIONS,
  });
  return _dailyReportQueue;
}

export function getFollowUpQueue(): Queue {
  if (_followUpQueue) return _followUpQueue;
  _followUpQueue = new Queue('follow-ups', {
    connection: getRedis(),
    defaultJobOptions: JOB_OPTIONS,
  });
  return _followUpQueue;
}
