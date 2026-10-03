// Fast-forward a 100-player, 48h credits challenge with realistic walkers and known cheat patterns,
// then settle it and report what the verifier caught.
//   MONGO_URL=... REDIS_URL=... STEPPOOL_DISABLE_QUEUE=1 npx tsx scripts/simulate.ts
import mongoose from 'mongoose';

import type { StepSample } from '../../shared/contracts.js';
import { joinChallenge } from '../src/challenges.js';
import { config } from '../src/config.js';
import { account, inTransaction, transfer } from '../src/ledger.js';
import { Challenge, connectDb, Participant, User } from '../src/models.js';
import { redis } from '../src/redis.js';
import { settleChallenge } from '../src/settle.js';
import { ingest } from '../src/steps.js';

process.env.STEPPOOL_DISABLE_QUEUE = '1';
const HOUR = 3_600_000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

type Persona = 'desk' | 'student' | 'trader' | 'watch' | 'lazysync' | 'shaker' | 'manual' | 'fakeapp' | 'dumper';
const MIX: [Persona, number][] = [
  ['desk', 25], ['student', 25], ['trader', 15], ['watch', 10], ['lazysync', 10], ['shaker', 5], ['manual', 4], ['fakeapp', 4], ['dumper', 2],
];
/** Personas whose phone never syncs in the background: everything arrives at the end. */
const UPLOADS_AT_END = new Set<Persona>(['lazysync', 'dumper']);

/** One sample per waking hour: `activeMin` minutes of walking at `spm` cadence. */
function day(fromMs: number, hours: number, activeMin: () => number, spm: () => number, source = 'com.apple.health.PHONE', tag = ''): StepSample[] {
  const out: StepSample[] = [];
  for (let h = 0; h < hours; h++) {
    const hourStart = fromMs + h * HOUR;
    const local = new Date(hourStart).getUTCHours();
    if (local < 6 || local > 21) continue; // asleep
    const mins = Math.min(60, Math.round(activeMin()));
    if (mins <= 0) continue;
    out.push({ start: new Date(hourStart).toISOString(), end: new Date(hourStart + mins * 60_000).toISOString(), count: Math.round(spm() * mins), source, nativeId: `${tag}${source}-${hourStart}`, recordingMethod: 'automatic' });
  }
  return out;
}

/** Six contiguous daytime hours of fan-strapped "walking" at a metronomic 160 spm. */
function shakerHours(fromMs: number, tag: string): StepSample[] {
  let h0 = fromMs;
  while (new Date(h0).getUTCHours() !== 10) h0 += HOUR;
  return Array.from({ length: 6 }, (_, i) => {
    const t = h0 + i * HOUR;
    return { start: new Date(t).toISOString(), end: new Date(t + HOUR).toISOString(), count: 9600, source: 'com.apple.health.PHONE', nativeId: `${tag}shake-${t}`, recordingMethod: 'automatic' as const };
  });
}

// Calibrated against typical urban days: desk ≈ 4–5k/day, student ≈ 8–10k, trader ≈ 20k+.
const desk = (from: number, hours: number, id: string) => day(from, hours, () => rand(0, 6), () => rand(90, 110), undefined, id);

function stepsFor(p: Persona, from: number, hours: number, id: string): StepSample[] {
  switch (p) {
    case 'desk': return desk(from, hours, id);
    case 'student':
    case 'lazysync': return day(from, hours, () => rand(3, 12), () => rand(95, 120), undefined, id);
    case 'trader': return day(from, hours, () => rand(15, 30), () => rand(85, 110), undefined, id);
    case 'watch': {
      const phone = day(from, hours, () => rand(4, 12), () => rand(95, 115), 'com.apple.health.PHONE', id);
      // The watch records the same walks a little higher: must count once, not twice.
      return [...phone, ...phone.map((s) => ({ ...s, source: 'com.apple.health.WATCH', nativeId: `w-${s.nativeId}`, count: Math.round(s.count * 1.04) }))];
    }
    // Cheaters are desk workers who try to buy their way past the goal.
    case 'shaker': return [...desk(from, hours, id), ...shakerHours(from, id)];
    case 'manual': return [...desk(from, hours, id), { start: new Date(from).toISOString(), end: new Date(from + HOUR).toISOString(), count: 60000, source: 'com.apple.Health', nativeId: `${id}-manual`, recordingMethod: 'manual' }];
    case 'fakeapp': return [...desk(from, hours, id), ...day(from, hours, () => 30, () => 120, 'com.stepcounter.cheat', id)];
    case 'dumper': return [...desk(from, hours, id), ...day(from, 24, () => 50, () => 115, 'com.apple.health.PHONE', `${id}d`)];
  }
}

await connectDb(config.mongoUrl);
await redis().flushdb();
await mongoose.connection.db!.dropDatabase();
await connectDb(config.mongoUrl);

const users: { id: string; persona: Persona }[] = [];
let n = 0;
for (const [persona, count] of MIX) {
  for (let i = 0; i < count; i++) {
    const u = await User.create({ email: `sim${n}@example.com`, name: `${persona} ${i + 1}` });
    await inTransaction((s) => transfer(s, { from: account.mint, to: account.user(u._id), amount: 1000, kind: 'signup_grant' }));
    users.push({ id: String(u._id), persona });
    n++;
  }
}

const startsAt = Math.floor(Date.now() / HOUR) * HOUR - 50 * HOUR;
const c = await Challenge.create({ name: 'Simulated Weekend', kind: 'credits', visibility: 'public', entryCredits: 100, inviteCode: 'SIM' + String(Date.now()).slice(-3), startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now() + 49 * HOUR), syncCutoffAt: new Date(Date.now() + 51 * HOUR) });
for (const u of users) await joinChallenge(String(c._id), u.id);
await Challenge.updateOne({ _id: c._id }, { $set: { status: 'live', startsAt: new Date(startsAt), endsAt: new Date(startsAt + 48 * HOUR), syncCutoffAt: new Date(startsAt + 50 * HOUR) } });

// Phones that sync normally upload every hour; lazy ones upload everything just before the cutoff.
const end = startsAt + 48 * HOUR;
for (const u of users) {
  const samples = stepsFor(u.persona, startsAt, 48, u.id);
  if (UPLOADS_AT_END.has(u.persona)) {
    await ingest(u.id, { platform: 'ios', samples }, new Date(end + HOUR));
    continue;
  }
  for (let t = startsAt + HOUR; t <= end; t += HOUR) {
    const batch = samples.filter((s) => {
      const e = new Date(s.end).getTime();
      return e <= t && e > t - HOUR;
    });
    if (batch.length) await ingest(u.id, { platform: 'ios', samples: batch }, new Date(t));
  }
}

await settleChallenge(String(c._id), new Date());
const parts = await Participant.find({ challengeId: c._id }).lean();
const settled = (await Challenge.findById(c._id).lean())!;

console.log(`\n${settled.name}: ${parts.length} players, pool ${parts.length * 100} cr → ${settled.finishers} finishers × ${settled.perFinisher} cr\n`);
console.log('persona   players  finished  avg steps  avg held  avg goal');
for (const [persona] of MIX) {
  const ps = parts.filter((p) => users.find((u) => u.id === String(p.userId))!.persona === persona);
  const avg = (f: (p: (typeof ps)[number]) => number) => Math.round(ps.reduce((a, p) => a + f(p), 0) / ps.length).toLocaleString();
  console.log(`${persona.padEnd(9)} ${String(ps.length).padStart(7)}  ${String(ps.filter((p) => p.status === 'finished').length).padStart(8)}  ${avg((p) => p.steps ?? 0).padStart(9)}  ${avg((p) => p.heldSteps ?? 0).padStart(8)}  ${avg((p) => p.goal).padStart(8)}`);
}
await new Promise((r) => setTimeout(r, 500)); // let fire-and-forget pushes finish
await mongoose.disconnect();
redis().disconnect();
