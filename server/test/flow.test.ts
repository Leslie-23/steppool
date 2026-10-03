import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StepSample } from '../../shared/contracts.js';
import { buildApp } from '../src/app.js';
import { lastHour, startChallenge } from '../src/lifecycle.js';
import { Challenge, connectDb } from '../src/models.js';
import { redis } from '../src/redis.js';
import { settleChallenge } from '../src/settle.js';
import { HOUR_MS } from '../src/verify.js';

let repl: MongoMemoryReplSet;
const app = buildApp();
const ADMIN = { 'x-admin-key': 'dev-admin' };

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : undefined,
  });
  await connectDb(repl.getUri('steppool-test'));
  await redis().flushdb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await repl?.stop();
  redis().disconnect();
});

let phoneSeq = 200000000;
async function signUp(name: string) {
  const phone = `+233${phoneSeq++}`;
  const { body: otp } = await request(app).post('/auth/otp').send({ phone }).expect(200);
  const { body } = await request(app).post('/auth/verify').send({ phone, code: otp.devCode }).expect(200);
  const auth = { authorization: `Bearer ${body.tokens.access}` };
  await request(app).patch('/me').set(auth).send({ name }).expect(200);
  return { auth, id: body.me.id as string };
}

const floorHour = (t: number) => Math.floor(t / HOUR_MS) * HOUR_MS;

/** Moves a freshly created challenge into the past so it is live now, then starts it. */
async function goLive(id: string, hoursAgo = 6) {
  const startsAt = floorHour(Date.now()) - hoursAgo * HOUR_MS;
  const endsAt = startsAt + 48 * HOUR_MS;
  await Challenge.updateOne({ _id: id }, { $set: { startsAt: new Date(startsAt), endsAt: new Date(endsAt), syncCutoffAt: new Date(endsAt + 2 * HOUR_MS) } });
  await startChallenge(id);
  return { startsAt, endsAt };
}

let seq = 0;
function walk(fromMs: number, minutes: number, stepsPerMin: number, extra: Partial<StepSample> = {}): StepSample[] {
  // 10-minute samples, like the phone's motion coprocessor writes them.
  const out: StepSample[] = [];
  for (let m = 0; m < minutes; m += 10) {
    const start = fromMs + m * 60_000;
    out.push({
      start: new Date(start).toISOString(),
      end: new Date(start + 10 * 60_000).toISOString(),
      count: stepsPerMin * 10,
      source: 'com.apple.health.PHONE1',
      nativeId: `s${seq++}`,
      recordingMethod: 'automatic',
      ...extra,
    });
  }
  return out;
}

const ingest = (auth: Record<string, string>, samples: StepSample[]) => request(app).post('/steps/ingest').set(auth).send({ platform: 'ios', samples }).expect(200);
const board = async (auth: Record<string, string>, id: string) => (await request(app).get(`/challenges/${id}/leaderboard`).set(auth).expect(200)).body as { name: string; steps: number; goalHit: boolean; rank: number }[];
const credits = async (auth: Record<string, string>) => (await request(app).get('/me').set(auth).expect(200)).body.credits as number;

describe('credits challenge, end to end', () => {
  it('runs signup → create → join → verified steps → settlement with a balanced ledger', async () => {
    const ama = await signUp('Ama Mensah');
    const kofi = await signUp('Kofi Boateng');
    const yaw = await signUp('Yaw Shaker');
    expect(await credits(ama.auth)).toBe(1000);

    const { body: c } = await request(app).post('/challenges').set(ama.auth).send({ name: 'RMU IT Walkers', durationHours: 48, entryCredits: 100, visibility: 'private' }).expect(201);
    expect(c.me.goal).toBe(14000); // no history → default 7,000/day × 2 days
    const { body: byCode } = await request(app).get(`/challenges/code/${c.inviteCode}`).set(kofi.auth).expect(200);
    expect(byCode.id).toBe(c.id);
    await request(app).post(`/challenges/${c.id}/join`).set(kofi.auth).expect(200);
    await request(app).post(`/challenges/${c.id}/join`).set(yaw.auth).expect(200);
    await request(app).post(`/challenges/${c.id}/join`).set(yaw.auth).expect(409); // no double entry
    expect(await credits(kofi.auth)).toBe(900);

    const { startsAt } = await goLive(c.id);

    // Ama: 200 min at 100 spm across the window = 20,000 real steps.
    await ingest(ama.auth, walk(startsAt, 100, 100));
    await ingest(ama.auth, walk(startsAt + HOUR_MS * 2, 100, 100));
    // Kofi: phone and watch both record the same 50-minute walk; must count once.
    const kofiWalk = walk(startsAt, 50, 100);
    await ingest(kofi.auth, [...kofiWalk, ...kofiWalk.map((s) => ({ ...s, nativeId: `w-${s.nativeId}`, source: 'com.apple.health.WATCH1', count: s.count + 20 }))]);
    // Yaw: a manual 50k entry, a step-faker app, and a "shaker" (no phone moves like this for 4h straight).
    await ingest(yaw.auth, [
      { start: new Date(startsAt).toISOString(), end: new Date(startsAt + HOUR_MS).toISOString(), count: 50000, source: 'com.apple.Health', nativeId: 'manual1', recordingMethod: 'manual' },
      { start: new Date(startsAt).toISOString(), end: new Date(startsAt + HOUR_MS).toISOString(), count: 6000, source: 'com.cheat.stepper', nativeId: 'cheat1', recordingMethod: 'automatic' },
    ]);

    let rows = await board(ama.auth, c.id);
    expect(rows.map((r) => [r.name, r.steps, r.goalHit])).toEqual([
      ['Ama Mensah', 20000, true],
      ['Kofi Boateng', 5100, false],
      ['Yaw Shaker', 0, false],
    ]);

    // Re-uploading the same samples (sync overlap) changes nothing.
    await ingest(ama.auth, walk(startsAt, 0, 0));
    const again = walk(startsAt, 100, 100).map((s, i) => ({ ...s, nativeId: `s${i}` }));
    await ingest(ama.auth, again);
    rows = await board(ama.auth, c.id);
    expect(rows[0].steps).toBe(20000);

    // Settle after the sync cutoff: Ama is the only finisher and takes the whole 300-credit pool.
    const ch = (await Challenge.findById(c.id))!;
    const after = new Date(ch.syncCutoffAt.getTime() + 1000);
    expect(await settleChallenge(c.id, after)).toEqual({ finishers: 1 });
    expect(await settleChallenge(c.id, after)).toBeNull(); // idempotent
    expect(await credits(ama.auth)).toBe(1200);
    expect(await credits(kofi.auth)).toBe(900);

    const { body: results } = await request(app).get(`/challenges/${c.id}/results`).set(ama.auth).expect(200);
    expect(results.finishers).toBe(1);
    expect(results.me).toMatchObject({ goalHit: true, wonCredits: 300, rank: 1 });

    const { body: wallet } = await request(app).get('/wallet').set(ama.auth).expect(200);
    expect(wallet.lines.map((l: { kind: string; amount: number }) => [l.kind, l.amount])).toEqual([
      ['payout', 300],
      ['entry', -100],
      ['signup_grant', 1000],
    ]);

    const { body: check } = await request(app).get('/admin/ledger/check').set(ADMIN).expect(200);
    expect(check).toEqual({ sum: 0, mismatchedUsers: [] });
  });

  it('holds shaker-pattern steps instead of counting them', async () => {
    const s = await signUp('Shaky Sam');
    const { body: c } = await request(app).post('/challenges').set(s.auth).send({ name: 'Shake test', durationHours: 48, entryCredits: 0, visibility: 'private' }).expect(201);
    const { startsAt } = await goLive(c.id);
    // 4 straight hours at 160 spm — only possible strapped to a fan.
    await ingest(s.auth, walk(startsAt - HOUR_MS, 240, 160));
    const [row] = await board(s.auth, c.id);
    expect(row.steps).toBe(0);
    const { body: flags } = await request(app).get(`/admin/challenges/${c.id}/flags`).set(ADMIN).expect(200);
    expect(flags[0].heldSteps).toBeGreaterThan(0);
  });

  it('refunds everyone when nobody hits their goal', async () => {
    const a = await signUp('Akua');
    const b = await signUp('Esi');
    const { body: c } = await request(app).post('/challenges').set(a.auth).send({ name: 'Too hard', durationHours: 48, entryCredits: 250, visibility: 'public' }).expect(201);
    await request(app).post(`/challenges/${c.id}/join`).set(b.auth).expect(200);
    await goLive(c.id);
    await lastHour(c.id);
    const ch = (await Challenge.findById(c.id))!;
    await settleChallenge(c.id, new Date(ch.syncCutoffAt.getTime() + 1));
    expect(await credits(a.auth)).toBe(1000);
    expect(await credits(b.auth)).toBe(1000);
  });

  it('rejects entries the user cannot afford', async () => {
    const poor = await signUp('Kwame');
    const rich = await signUp('Abena');
    for (let i = 0; i < 4; i++) {
      await request(app).post('/challenges').set(poor.auth).send({ name: `Spend ${i}`, durationHours: 48, entryCredits: 250, visibility: 'private' }).expect(201);
    }
    expect(await credits(poor.auth)).toBe(0);
    const { body: c } = await request(app).post('/challenges').set(rich.auth).send({ name: 'Pricey', durationHours: 48, entryCredits: 250, visibility: 'public' }).expect(201);
    const { body } = await request(app).post(`/challenges/${c.id}/join`).set(poor.auth).expect(409);
    expect(body.error).toBe('Not enough credits');
  });
});

describe('sponsored challenge', () => {
  it('is free to enter, shows as featured, and creates claimable prizes for finishers', async () => {
    const { body: sc } = await request(app)
      .post('/admin/challenges')
      .set(ADMIN)
      .send({ name: 'MTN Walk Week', durationHours: 48, entryCredits: 0, visibility: 'public', sponsor: { name: 'MTN', prizeDescription: 'GH₵1,000 split between finishers', prizeValueGhs: 1000 } })
      .expect(201);
    const walker = await signUp('Nana Walker');
    const { body: lobby } = await request(app).get('/challenges').set(walker.auth).expect(200);
    expect(lobby.featured.map((c: { id: string }) => c.id)).toContain(sc.id);

    await request(app).post(`/challenges/${sc.id}/join`).set(walker.auth).expect(200);
    expect(await credits(walker.auth)).toBe(1000);
    const { startsAt } = await goLive(sc.id);
    await ingest(walker.auth, walk(startsAt, 160, 100));

    const ch = (await Challenge.findById(sc.id))!;
    await settleChallenge(sc.id, new Date(ch.syncCutoffAt.getTime() + 1));
    const { body: results } = await request(app).get(`/challenges/${sc.id}/results`).set(walker.auth).expect(200);
    expect(results.me.prize).toBe('GH₵1,000.00 from MTN');

    await request(app).post(`/payouts/${results.me.payoutId}/claim`).set(walker.auth).send({ momoNumber: '+233241234567', network: 'mtn' }).expect(200);
    await request(app).post(`/payouts/${results.me.payoutId}/claim`).set(walker.auth).send({ momoNumber: '+233241234567', network: 'mtn' }).expect(404);
    await request(app).post(`/admin/payouts/${results.me.payoutId}/fulfill`).set(ADMIN).expect(200);
  });
});

describe('auth', () => {
  it('rejects wrong codes and locks out after repeated attempts', async () => {
    const phone = '+233599999999';
    await request(app).post('/auth/otp').send({ phone }).expect(200);
    for (let i = 0; i < 5; i++) await request(app).post('/auth/verify').send({ phone, code: '000000' }).expect(400);
    await request(app).post('/auth/verify').send({ phone, code: '000000' }).expect(429);
  });

  it('refreshes tokens', async () => {
    const phone = '+233588888888';
    const { body: otp } = await request(app).post('/auth/otp').send({ phone });
    const { body } = await request(app).post('/auth/verify').send({ phone, code: otp.devCode });
    const { body: fresh } = await request(app).post('/auth/refresh').send({ refresh: body.tokens.refresh }).expect(200);
    await request(app).get('/me').set({ authorization: `Bearer ${fresh.access}` }).expect(200);
  });

  it('serves the invite landing page with link previews', async () => {
    const res = await request(app).get('/j/NOPE00').expect(200);
    expect(res.text).toContain('og:title');
  });
});

describe('validation', () => {
  it('returns 400 (not 500) for bad bodies validated by shared contracts', async () => {
    const u = await signUp('Validator');
    const { body } = await request(app).post('/challenges').set(u.auth).send({ name: 'x', durationHours: 5 }).expect(400);
    expect(body.error).toBeTruthy();
    await request(app).post('/steps/ingest').set(u.auth).send({ platform: 'ios', samples: [{ count: -1 }] }).expect(400);
  });
});

describe('sustained-cadence holds survive later syncs', () => {
  it('keeps a shaker run held when a later sync rebuilds only its tail', async () => {
    const s = await signUp('Fan Strapper');
    const { body: c } = await request(app).post('/challenges').set(s.auth).send({ name: 'Fan test', durationHours: 48, entryCredits: 0, visibility: 'private' }).expect(201);
    const { startsAt } = await goLive(c.id, 9);
    const run = walk(startsAt, 300, 160); // h0–h4 inside the window, 9,600/hour
    for (let h = 0; h < 5; h++) await ingest(s.auth, run.slice(h * 6, h * 6 + 6)); // hourly syncs
    expect((await board(s.auth, c.id))[0].steps).toBe(0);
    // A normal walk at h7 rebuilds h3–h11, which on its own shows only two hours of the run.
    await ingest(s.auth, walk(startsAt + HOUR_MS * 7, 20, 100));
    expect((await board(s.auth, c.id))[0].steps).toBe(2000);
  });
});
