import { Queue } from 'bullmq';

import { newRedis } from './redis.js';

export const QUEUE = 'challenges';

export type JobName = 'start' | 'last-hour' | 'settle' | 'sweep' | 'weekly-topup';
export type JobData = { challengeId?: string };

let queue: Queue<JobData, unknown, JobName> | null = null;
export function challengeQueue() {
  queue ??= new Queue<JobData, unknown, JobName>(QUEUE, { connection: newRedis() });
  return queue;
}

/**
 * Delayed jobs for a challenge's lifecycle. Deterministic job ids make this idempotent;
 * the worker's periodic sweep is the safety net if a job is ever lost.
 */
export async function scheduleChallenge(c: { _id: unknown; startsAt: Date; endsAt: Date; syncCutoffAt: Date }) {
  if (process.env.STEPPOOL_DISABLE_QUEUE === '1') return;
  const id = String(c._id);
  const q = challengeQueue();
  const delay = (d: Date) => Math.max(0, d.getTime() - Date.now());
  const opts = { removeOnComplete: true, removeOnFail: 100, attempts: 5, backoff: { type: 'exponential', delay: 30_000 } };
  await Promise.all([
    q.add('start', { challengeId: id }, { ...opts, jobId: `start-${id}`, delay: delay(c.startsAt) }),
    q.add('last-hour', { challengeId: id }, { ...opts, jobId: `last-hour-${id}`, delay: delay(new Date(c.endsAt.getTime() - 3_600_000)) }),
    q.add('settle', { challengeId: id }, { ...opts, jobId: `settle-${id}`, delay: delay(c.syncCutoffAt) }),
  ]);
}
