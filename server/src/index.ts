import { createServer } from 'node:http';

import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';

import type { ClientToServer, ServerToClient } from '../../shared/contracts.js';

import { buildApp } from './app.js';
import { verifyAccess } from './auth.js';
import { config } from './config.js';
import { startJobs } from './jobs.js';
import { connectDb } from './models.js';
import { newRedis } from './redis.js';
import { room, setBroadcaster, startLeaderboardTicker } from './realtime.js';

await connectDb(config.mongoUrl);

const app = buildApp();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient, Record<string, never>, { userId: string }>(http, {
  cors: { origin: '*' },
  // The Redis adapter lets several API instances, and the worker's emitter, reach every socket.
  adapter: createAdapter(newRedis(), newRedis()),
});

io.use((socket, next) => {
  const userId = verifyAccess(String(socket.handshake.auth?.token ?? ''));
  if (!userId) return next(new Error('unauthorized'));
  socket.data.userId = userId;
  next();
});

io.on('connection', (socket) => {
  socket.on('challenge:watch', async (challengeId) => {
    // Leaderboards are visible to anyone holding the challenge id (the same rule as GET /challenges/:id).
    if (typeof challengeId !== 'string' || !/^[a-f0-9]{24}$/.test(challengeId)) return;
    await socket.join(room(challengeId));
  });
  socket.on('challenge:unwatch', (challengeId) => {
    if (typeof challengeId === 'string') socket.leave(room(challengeId));
  });
});

setBroadcaster(io);
startLeaderboardTicker();
if (config.jobsInProcess) {
  await startJobs();
  console.log('Lifecycle jobs running in-process');
}

http.listen(config.port, () => console.log(`StepPool API on :${config.port}`));
