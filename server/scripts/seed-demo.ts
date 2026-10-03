// Seeds a believable demo world for screenshots and manual testing.
//   MONGO_URL=... REDIS_URL=... STEPPOOL_DISABLE_QUEUE=1 npx tsx scripts/seed-demo.ts
// Then sign in on a dev build with: steppool://dev-login?phone=%2B233240000001
import mongoose, { type Types } from 'mongoose';

import type { StepSample } from '../../shared/contracts.js';
import { joinChallenge } from '../src/challenges.js';
import { config } from '../src/config.js';
import { account, inTransaction, transfer } from '../src/ledger.js';
import { Challenge, connectDb, User } from '../src/models.js';
import { redis } from '../src/redis.js';
import { settleChallenge } from '../src/settle.js';
import { ingest } from '../src/steps.js';

process.env.STEPPOOL_DISABLE_QUEUE = '1';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const floorHour = (t: number) => Math.floor(t / HOUR) * HOUR;

const PEOPLE = [
  ['Leslie Ajayi', 1.0], ['Ama Owusu', 1.35], ['Kwame Asante', 1.25], ['Efua Mensah', 1.08], ['Kofi Boateng', 0.95],
  ['Abena Darko', 0.9], ['Yaw Osei', 0.82], ['Akosua Agyeman', 0.7], ['Nana Addo', 0.62], ['Esi Quaye', 0.5], ['Kojo Antwi', 0.42], ['Adjoa Frimpong', 0.3],
] as const;

let seq = 0;
/** Realistic hourly walking between 07:00 and 21:00 UTC for [from, to), scaled per person. */
function walking(from: number, to: number, scale: number): StepSample[] {
  const out: StepSample[] = [];
  for (let h = floorHour(from); h + HOUR <= to; h += HOUR) {
    const hr = new Date(h).getUTCHours();
    if (hr < 7 || hr > 21) continue;
    const peak = hr === 8 || hr === 13 || hr === 18 ? 2.2 : 1;
    const mins = Math.min(55, Math.round((4 + Math.random() * 6) * peak * scale));
    out.push({ start: new Date(h).toISOString(), end: new Date(h + mins * 60_000).toISOString(), count: Math.round(mins * (98 + Math.random() * 14)), source: 'com.apple.health.DEMO', nativeId: `demo-${seq++}`, recordingMethod: 'automatic' });
  }
  return out;
}

async function upload(userId: string, samples: StepSample[]) {
  // Replay hourly so nothing looks like a late dump.
  const byHour = new Map<number, StepSample[]>();
  for (const s of samples) {
    const k = floorHour(new Date(s.end).getTime()) + HOUR;
    byHour.set(k, [...(byHour.get(k) ?? []), s]);
  }
  for (const [t, batch] of [...byHour].sort((a, b) => a[0] - b[0])) await ingest(userId, { platform: 'ios', samples: batch }, new Date(Math.min(t, now)));
}

async function makeChallenge(name: string, startsAt: number, hours: number, entry: number, sponsor?: object) {
  const c = await Challenge.create({
    name, kind: sponsor ? 'sponsored' : 'credits', visibility: 'public', entryCredits: entry,
    inviteCode: name.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase() + String(now).slice(-3),
    startsAt: new Date(now + HOUR), endsAt: new Date(now + HOUR + hours * HOUR), syncCutoffAt: new Date(now + 3 * HOUR + hours * HOUR), sponsor,
  });
  return { c, open: async (ids: string[]) => {
    for (const id of ids) await joinChallenge(String(c._id), id);
    await Challenge.updateOne({ _id: c._id }, { $set: { status: 'live', startsAt: new Date(startsAt), endsAt: new Date(startsAt + hours * HOUR), syncCutoffAt: new Date(startsAt + (hours + 2) * HOUR) } });
  } };
}

await connectDb(config.mongoUrl);
await mongoose.connection.db!.dropDatabase();
await redis().flushdb();
await connectDb(config.mongoUrl);

const ids: string[] = [];
for (const [i, [name]] of PEOPLE.entries()) {
  const u = await User.create({ phone: `+2332400000${String(i + 1).padStart(2, '0')}`, name });
  await inTransaction((s) => transfer(s, { from: account.mint, to: account.user(u._id as Types.ObjectId), amount: 1000, kind: 'signup_grant' }));
  ids.push(String(u._id));
}

// A week of history before anything starts, so baselines (and goals) are personal.
const historyFrom = floorHour(now) - 9 * DAY;
for (const [i, [, scale]] of PEOPLE.entries()) await upload(ids[i], walking(historyFrom, historyFrom + 6 * DAY, scale));

// Finished last weekend: Leslie hit the goal.
const done = await makeChallenge('Last Weekend Dash', historyFrom + 3 * DAY, 48, 50);
await done.open(ids.slice(0, 8));
await settleChallenge(String(done.c._id), new Date(historyFrom + 6 * DAY));

// Live now: a week-long class challenge, started 3 days ago.
const liveStart = floorHour(now) - 3 * DAY;
const live = await makeChallenge('RMU IT Walkers', liveStart, 168, 100);
await live.open(ids);
const sponsored = await makeChallenge('MTN Walk Week', liveStart, 168, 0, { name: 'MTN', prizeDescription: 'GH₵2,000 split between everyone who hits their goal', prizeValueGhs: 2000 });
await sponsored.open(ids.slice(0, 9));
await makeChallenge('Weekend Warriors', floorHour(now) + 20 * HOUR, 48, 50).then((x) => x.c);

for (const [i, [, scale]] of PEOPLE.entries()) await upload(ids[i], walking(historyFrom + 6 * DAY, now, scale));

const me = await User.findById(ids[0]).lean();
console.log(`Seeded ${ids.length} walkers. Leslie: ${me?.credits} credits, baseline ${me?.baselineDaily}/day.`);
console.log('Sign in: steppool://dev-login?phone=%2B233240000001');
await new Promise((r) => setTimeout(r, 500));
await mongoose.disconnect();
redis().disconnect();
