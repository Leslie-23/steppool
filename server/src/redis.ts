import { Redis } from 'ioredis';

import { config } from './config.js';

let shared: Redis | null = null;

/** One shared command connection per process. */
export function redis() {
  shared ??= new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  return shared;
}

/** Fresh connections for pub/sub and BullMQ, which need their own. */
export function newRedis() {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}
