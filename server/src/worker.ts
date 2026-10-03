// Standalone worker process (paid plans). On the free plan the API runs jobs in-process instead.
import { Emitter } from '@socket.io/redis-emitter';

import { config } from './config.js';
import { startJobs } from './jobs.js';
import { connectDb } from './models.js';
import { newRedis } from './redis.js';
import { setBroadcaster, type Broadcaster } from './realtime.js';

await connectDb(config.mongoUrl);
// The worker has no sockets of its own; it publishes through Redis to the API's Socket.IO adapter.
setBroadcaster(new Emitter(newRedis()) as unknown as Broadcaster);

const close = await startJobs();
console.log('StepPool worker running');

const shutdown = async () => {
  await close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
