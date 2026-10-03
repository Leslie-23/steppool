import { Emitter } from '@socket.io/redis-emitter';
import { Worker } from 'bullmq';

import { config } from './config.js';
import { lastHour, startChallenge, sweep } from './lifecycle.js';
import { connectDb } from './models.js';
import { challengeQueue, QUEUE, type JobData, type JobName } from './queue.js';
import { newRedis } from './redis.js';
import { setBroadcaster, type Broadcaster } from './realtime.js';
import { settleChallenge } from './settle.js';

await connectDb(config.mongoUrl);
// The worker has no sockets of its own; it publishes through Redis to the API's Socket.IO adapter.
setBroadcaster(new Emitter(newRedis()) as unknown as Broadcaster);

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
    }
  },
  { connection: newRedis(), concurrency: 4 },
);

await challengeQueue().upsertJobScheduler('sweep', { every: 5 * 60_000 }, { name: 'sweep', data: {} });

worker.on('failed', (job, err) => console.error(`job ${job?.name} ${job?.id} failed`, err));
console.log('StepPool worker running');

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
