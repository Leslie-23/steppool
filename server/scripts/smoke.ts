// Live smoke test against running API + worker processes.
//   API_URL=http://localhost:4000 MONGO_URL=... REDIS_URL=... npx tsx scripts/smoke.ts
// Exercises: OTP sign-in, create/join, socket leaderboard push, worker-driven settlement.
import { Queue } from 'bullmq';
import mongoose from 'mongoose';
import { io } from 'socket.io-client';

import { config } from '../src/config.js';
import { Challenge } from '../src/models.js';
import { QUEUE } from '../src/queue.js';
import { newRedis } from '../src/redis.js';

const API = process.env.API_URL ?? 'http://localhost:4000';
const HOUR = 3_600_000;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function signUp(phone: string, name: string) {
  const { devCode } = await call<{ devCode: string }>('POST', '/auth/otp', { phone });
  const { tokens } = await call<{ tokens: { access: string } }>('POST', '/auth/verify', { phone, code: devCode });
  await call('PATCH', '/me', { name }, tokens.access);
  return tokens.access;
}

const check = (ok: boolean, label: string) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) process.exitCode = 1;
};

await mongoose.connect(config.mongoUrl);
const stamp = String(Date.now()).slice(-6);
const ama = await signUp(`+233200${stamp}`, 'Ama Smoke');
const kofi = await signUp(`+233201${stamp}`, 'Kofi Smoke');
check(true, 'signed up two users');

const c = await call<{ id: string; inviteCode: string }>('POST', '/challenges', { name: 'Smoke Walk', durationHours: 48, entryCredits: 100, visibility: 'private' }, ama);
await call('POST', `/challenges/${c.id}/join`, undefined, kofi);
check(true, `created + joined challenge ${c.inviteCode}`);

// Pull the window into the past and let the worker start it.
const startsAt = Math.floor(Date.now() / HOUR) * HOUR - 6 * HOUR;
await Challenge.updateOne({ _id: c.id }, { $set: { startsAt: new Date(startsAt), endsAt: new Date(startsAt + 48 * HOUR), syncCutoffAt: new Date(startsAt + 50 * HOUR) } });
const queue = new Queue(QUEUE, { connection: newRedis() });
await queue.add('sweep', {});
for (let i = 0; i < 20 && (await Challenge.findById(c.id))?.status !== 'live'; i++) await new Promise((r) => setTimeout(r, 250));
check((await Challenge.findById(c.id))?.status === 'live', 'worker sweep started the challenge');

const socket = io(API, { transports: ['websocket'], auth: { token: kofi } });
const delta = new Promise<{ rows: { name: string; steps: number }[] }>((resolve) => socket.on('leaderboard:delta', resolve));
const goal = new Promise<{ name: string }>((resolve) => socket.on('goal:hit', resolve));
await new Promise<void>((r) => socket.on('connect', () => r()));
socket.emit('challenge:watch', c.id);
await new Promise((r) => setTimeout(r, 200));

const samples = Array.from({ length: 16 }, (_, i) => ({
  start: new Date(startsAt + i * 10 * 60_000).toISOString(),
  end: new Date(startsAt + (i + 1) * 10 * 60_000).toISOString(),
  count: 1000,
  source: 'com.apple.health.SMOKE',
  nativeId: `smoke-${stamp}-${i}`,
  recordingMethod: 'automatic',
}));
const ing = await call<{ todaySteps: number }>('POST', '/steps/ingest', { platform: 'ios', samples }, ama);
check(ing.todaySteps >= 0, 'ingested 16k steps');

const timeout = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
const d = await timeout(delta);
check(d.rows[0]?.name === 'Ama Smoke' && d.rows[0].steps === 16000, `socket leaderboard push: ${d.rows.map((r) => `${r.name}=${r.steps}`).join(', ')}`);
check((await timeout(goal)).name === 'Ama Smoke', 'socket goal:hit push');

const settled = new Promise((resolve) => socket.on('challenge:settled', resolve));
await Challenge.updateOne({ _id: c.id }, { $set: { syncCutoffAt: new Date(Date.now() - 1000) } });
await queue.add('sweep', {});
await timeout(settled);
check(true, 'worker settled the challenge and the socket heard it (via Redis emitter)');
const res = await call<{ me: { wonCredits: number } }>('GET', `/challenges/${c.id}/results`, undefined, ama);
check(res.me.wonCredits === 200, `Ama won the 200-credit pool (got ${res.me.wonCredits})`);
const ledger = await fetch(`${API}/admin/ledger/check`, { headers: { 'x-admin-key': process.env.ADMIN_API_KEY ?? 'dev-admin' } }).then((r) => r.json());
check(ledger.sum === 0 && ledger.mismatchedUsers.length === 0, `ledger balanced: ${JSON.stringify(ledger)}`);
const landing = await fetch(`${API}/j/${c.inviteCode}`).then((r) => r.text());
check(landing.includes('Smoke Walk'), 'invite landing page renders');

socket.close();
await queue.close();
await mongoose.disconnect();
process.exit();
