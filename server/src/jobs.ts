import { Worker } from 'bullmq';

import { ensureWeeklyChallenge } from './challenges.js';
import { eveningNudge, weeklyRecap } from './engage.js';
import { lastHour, startChallenge, sweep } from './lifecycle.js';
import { challengeQueue, QUEUE, type JobData, type JobName } from './queue.js';
import { newRedis } from './redis.js';
import { weeklyTopup } from './rewards.js';
import { settleChallenge } from './settle.js';

/** Starts the lifecycle job worker plus the 5-minute safety sweep. Returns a closer. */
export async function startJobs() {
  const worker = new Worker<JobData, unknown, JobName>(
    QUEUE,
    async (job) => {
      const id = job.data.challengeId;
      switch (job.name) {
        case 'start':
          return id && startChallenge(id);
        case 'last-hour':
          return id && lastHour(id);
        case 'settle':
          return id && settleChallenge(id);
        case 'sweep':
          return sweep();
        case 'weekly-topup':
          return weeklyTopup();
        case 'weekly-challenge':
          return ensureWeeklyChallenge();
        case 'weekly-recap':
          return weeklyRecap();
        case 'nudge':
          return eveningNudge();
      }
    },
    { connection: newRedis(), concurrency: 4 },
  );
  worker.on('failed', (job, err) => console.error(`job ${job?.name} ${job?.id} failed`, err));
  await challengeQueue().upsertJobScheduler('sweep', { every: 5 * 60_000 }, { name: 'sweep', data: {} });
  // Mondays 06:00 UTC (06:00 in Accra): top everyone below the floor back up.
  await challengeQueue().upsertJobScheduler('weekly-topup', { pattern: '0 6 * * 1', tz: 'UTC' }, { name: 'weekly-topup', data: {} });
  // Mondays: 06:00 this week's free Weekly Walk opens, 07:00 everyone's recap of last week.
  await challengeQueue().upsertJobScheduler('weekly-challenge', { pattern: '0 6 * * 1', tz: 'UTC' }, { name: 'weekly-challenge', data: {} });
  await challengeQueue().upsertJobScheduler('weekly-recap', { pattern: '0 7 * * 1', tz: 'UTC' }, { name: 'weekly-recap', data: {} });
  // Evenings, hourly: a nudge for anyone close to today's target (at most one a day each).
  await challengeQueue().upsertJobScheduler('nudge', { pattern: '0 17-20 * * *', tz: 'UTC' }, { name: 'nudge', data: {} });
  // A deploy mid-week still gets this week's Weekly Walk.
  await challengeQueue().add('weekly-challenge', {}, { removeOnComplete: true });
  // A sleeping free-tier instance misses its schedule; catch up immediately on boot.
  await challengeQueue().add('sweep', {}, { removeOnComplete: true });
  return () => worker.close();
}
