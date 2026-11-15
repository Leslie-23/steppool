import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DAY_MS } from '../../shared/contracts.js';
import { WEEKLY_WALK } from '../../shared/engage.js';
import { checkRecords, weekStart } from '../src/achievements.js';
import { buildApp } from '../src/app.js';
import { ensureWeeklyChallenge, joinDeadline, nextRoundName, weeklyWindow } from '../src/challenges.js';
import { eveningNudge, weeklyRecap } from '../src/engage.js';
import { startChallenge } from '../src/lifecycle.js';
import { balanceOf } from '../src/ledger.js';
import { Challenge, connectDb, HourBucket, Ledger, Notification, Participant, User } from '../src/models.js';
import { redis } from '../src/redis.js';
import { rewardDailyTarget } from '../src/rewards.js';
import { settleChallenge } from '../src/settle.js';
import { HOUR_MS } from '../src/verify.js';

let repl: MongoMemoryReplSet;
const app = buildApp();

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : undefined,
  });
  await connectDb(repl.getUri('steppool-engage-test'));
  await redis().flushdb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await repl?.stop();
  redis().disconnect();
});

let seq = 0;
async function signUp(name: string) {
  const email = `engage${seq++}@example.com`;
  const { body: otp } = await request(app).post('/auth/otp').send({ email }).expect(200);
  const { body } = await request(app).post('/auth/verify').send({ email, code: otp.devCode }).expect(200);
  const auth = { authorization: `Bearer ${body.tokens.access}` };
  await request(app).patch('/me').set(auth).send({ name }).expect(200);
  return { auth, id: body.me.id as string, oid: new mongoose.Types.ObjectId(body.me.id as string) };
}
const credits = async (auth: Record<string, string>) => (await request(app).get('/me').set(auth).expect(200)).body.credits as number;
/** Verified steps written straight into the hourly buckets, at noon of the given UTC day. */
const steps = (userId: mongoose.Types.ObjectId, day: number, counted: number) => HourBucket.create({ userId, hour: new Date(Math.floor(day / DAY_MS) * DAY_MS + 12 * HOUR_MS), counted });
/** Notifications are fire-and-forget; wait for them to land. */
const inbox = (userId: string, match: Record<string, unknown>, count = 1) =>
  vi.waitFor(async () => {
    const rows = await Notification.find({ userId, ...match }).lean();
    expect(rows.length).toBeGreaterThanOrEqual(count);
    return rows;
  });
const settled = async (id: string) => {
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  await Challenge.updateOne({ _id: id }, { $set: { startsAt: new Date(now - 51 * HOUR_MS), endsAt: new Date(now - 3 * HOUR_MS), syncCutoffAt: new Date(now - HOUR_MS) } });
  await startChallenge(id);
  await settleChallenge(id);
};

describe('rematch', () => {
  it('names each round', () => {
    expect(nextRoundName('Lunch Crew')).toBe('Lunch Crew · Round 2');
    expect(nextRoundName('Lunch Crew · Round 2')).toBe('Lunch Crew · Round 3');
    expect(nextRoundName('x'.repeat(48)).length).toBeLessThanOrEqual(48);
  });

  it('runs a finished challenge again: the first player creates it, the rest are invited and join the same one', async () => {
    const [ama, kofi, stranger] = [await signUp('Ama Mensah'), await signUp('Kofi Boateng'), await signUp('Yaw')];
    const { body: c } = await request(app).post('/challenges').set(ama.auth).send({ name: 'Lunch Crew', durationHours: 48, entryCredits: 50, visibility: 'private', goalMultiplier: 1.3 }).expect(201);
    await request(app).post(`/challenges/${c.id}/join`).set(kofi.auth).expect(200);
    await request(app).post(`/challenges/${c.id}/rematch`).set(ama.auth).expect(409); // not finished yet
    await settled(c.id);
    expect(await credits(ama.auth)).toBe(1000); // nobody made it: entries refunded

    const first = (await request(app).get(`/challenges/${c.id}/results`).set(ama.auth).expect(200)).body;
    expect(first).toMatchObject({ canRematch: true });
    expect(first.rematch).toBeUndefined();
    await request(app).post(`/challenges/${c.id}/rematch`).set(stranger.auth).expect(403);

    const { body: again } = await request(app).post(`/challenges/${c.id}/rematch`).set(ama.auth).expect(201);
    expect(again).toMatchObject({ name: 'Lunch Crew · Round 2', entryCredits: 50, goalMultiplier: 1.3, visibility: 'private', players: 1 });
    expect(again.me).toBeTruthy();
    expect(new Date(again.endsAt).getTime() - new Date(again.startsAt).getTime()).toBe(48 * HOUR_MS);
    expect(await credits(ama.auth)).toBe(950);

    const [invite] = await inbox(kofi.id, { dedupe: `rematch:${again.id}` });
    expect(invite).toMatchObject({ title: 'Ama wants a rematch', kind: 'announcement' });
    expect(await Notification.countDocuments({ userId: ama.id, dedupe: `rematch:${again.id}` })).toBe(0);

    const seen = (await request(app).get(`/challenges/${c.id}/results`).set(kofi.auth).expect(200)).body;
    expect(seen.rematch).toMatchObject({ id: again.id, players: 1, joined: false });
    const { body: joined } = await request(app).post(`/challenges/${c.id}/rematch`).set(kofi.auth).expect(201);
    expect(joined).toMatchObject({ id: again.id, players: 2 });
    // Asking again once you're in changes nothing.
    await request(app).post(`/challenges/${c.id}/rematch`).set(kofi.auth).expect(201);
    expect(await Challenge.countDocuments({ rematchOf: c.id })).toBe(1);
    expect(await credits(kofi.auth)).toBe(950);
    // Joining a first challenge earns a badge.
    await vi.waitFor(async () => expect((await User.findById(ama.id).lean())!.badges!.map((b) => b.id)).toContain('first_challenge'));
  });
});

describe('weekly house challenge', () => {
  it('opens once per week, funded by the house, joinable until its last day, and returns an unwon prize', async () => {
    // Mid-window, so the test doesn't depend on which weekday it runs.
    const real = weeklyWindow(Date.now());
    const now = Date.now() > real.end - 2 * DAY_MS ? real.end + DAY_MS : Date.now();
    const made = await ensureWeeklyChallenge(now);
    expect(made).toMatchObject({ house: true, kind: 'credits', visibility: 'public', entryCredits: 0 });
    expect(made!.name).toMatch(new RegExp(`^${WEEKLY_WALK.name} · \\d+ \\w+$`));
    expect(await ensureWeeklyChallenge(now)).toBeNull();
    expect(await ensureWeeklyChallenge(now + HOUR_MS)).toBeNull();
    expect(await Challenge.countDocuments({ house: true })).toBe(1);
    expect(await balanceOf(`pool:${made!._id}`)).toBe(WEEKLY_WALK.prizeCredits);
    // Monday 06:00 UTC to the next Monday 06:00, open to join until 24h before the end.
    expect(new Date(made!.startsAt).getUTCDay()).toBe(1);
    expect(new Date(made!.startsAt).getUTCHours()).toBe(6);
    expect(joinDeadline(made!).getTime()).toBe(made!.endsAt.getTime() - 24 * HOUR_MS);
    // Too close to the end: wait for Monday's run instead.
    expect(await ensureWeeklyChallenge(weeklyWindow(now + 14 * DAY_MS).end - HOUR_MS)).toBeNull();

    const u = await signUp('Esi');
    const lobby = (await request(app).get('/challenges').set(u.auth).expect(200)).body;
    expect(lobby.open[0]).toMatchObject({ id: String(made!._id), house: true, poolCredits: WEEKLY_WALK.prizeCredits });
    await request(app).post(`/challenges/${made!._id}/join`).set(u.auth).expect(200);
    expect(await credits(u.auth)).toBe(1000); // free to enter
    await request(app).post(`/challenges/${made!._id}/rematch`).set(u.auth).expect(409);

    // Nobody hits the goal: the prize goes back to the house and the pool ends at zero.
    await startChallenge(String(made!._id), new Date(made!.startsAt.getTime() + 1));
    await settleChallenge(String(made!._id), new Date(made!.endsAt.getTime() + 3 * HOUR_MS));
    expect(await balanceOf(`pool:${made!._id}`)).toBe(0);
    const [sum] = await Ledger.aggregate<{ sum: number }>([{ $group: { _id: null, sum: { $sum: '$amount' } } }]);
    expect(sum.sum).toBe(0);
    expect((await Participant.findOne({ challengeId: made!._id, userId: u.id }))!.status).toBe('missed');
  });
});

describe('weekly recap', () => {
  it('sums up last week against the week before, once', async () => {
    const u = await signUp('Abena');
    const monday = Date.UTC(2027, 2, 8, 7); // a Monday, 07:00 UTC
    const last = weekStart(monday) - 7 * DAY_MS;
    await steps(u.oid, last, 9000); // Mon: on target (7,000)
    await steps(u.oid, last + 2 * DAY_MS, 8000); // Wed: on target
    await steps(u.oid, last + 5 * DAY_MS, 4000); // Sat
    await steps(u.oid, last - 3 * DAY_MS, 14000); // the week before
    expect(await weeklyRecap(monday)).toBe(1);
    const [n] = await inbox(u.id, { kind: 'announcement', title: /^Your week/ });
    expect(n.title).toBe('Your week: 21,000 steps');
    expect(n.body).toBe('Up 50% on the week before · 2 of 7 days on target · best day Mon (9,000).');
    await weeklyRecap(monday + HOUR_MS);
    await new Promise((r) => setTimeout(r, 200));
    expect(await Notification.countDocuments({ userId: u.id, title: /^Your week/ })).toBe(1);
  });
});

describe('evening nudge', () => {
  it('reaches only people close to their target, in the evening, once a day', async () => {
    const [close, far, done, silent] = [await signUp('Close'), await signUp('Far'), await signUp('Done'), await signUp('Silent')];
    await User.updateMany({ _id: { $in: [close.id, far.id, done.id] } }, { $set: { pushToken: 'test-token' } });
    const evening = Date.UTC(2027, 2, 10, 18);
    for (const [u, n] of [[close, 5600], [far, 2000], [done, 7400], [silent, 5600]] as const) await steps(u.oid, evening, n);
    expect(await eveningNudge(Date.UTC(2027, 2, 10, 12))).toBe(0); // midday: never
    expect(await eveningNudge(evening)).toBe(1);
    const [n] = await inbox(close.id, { kind: 'reminder' });
    expect(n).toMatchObject({ title: "1,400 steps to today's target", body: 'About a 15-minute walk. Finish it for +20 credits.' });
    await eveningNudge(evening + HOUR_MS);
    await new Promise((r) => setTimeout(r, 200));
    expect(await Notification.countDocuments({ kind: 'reminder', userId: { $in: [close.id, far.id, done.id, silent.id] } })).toBe(1);
  });
});

describe('records and badges', () => {
  it('backfills quietly, then celebrates a new best day once and awards badges once', async () => {
    const u = await signUp('Akua');
    await User.collection.updateOne({ _id: u.oid }, { $set: { createdAt: new Date(Date.UTC(2027, 1, 1)) } });
    const today = Date.UTC(2027, 2, 17, 15);
    await steps(u.oid, today - 2 * DAY_MS, 8000);
    await steps(u.oid, today - 8 * DAY_MS, 5000);
    await steps(u.oid, today - 9 * DAY_MS, 5000); // last week: 10,000 in total
    const week = async () => 12_000;

    await checkRecords(u.oid, today, 3000, async () => 9000); // first call: history only
    expect((await User.findById(u.id).lean())!.records).toMatchObject({ bestDaySteps: 8000, bestWeekSteps: 10_000 });
    expect(await Notification.countDocuments({ userId: u.id, title: 'New best day' })).toBe(0);

    await checkRecords(u.oid, today, 10_500, week);
    await checkRecords(u.oid, today, 11_200, week); // still today: no second celebration
    const [n] = await inbox(u.id, { title: 'New best day' });
    expect(n.body).toBe('You just passed your record of 8,000 steps. Keep going.');
    await inbox(u.id, { title: 'Your best week yet' });
    await new Promise((r) => setTimeout(r, 200));
    expect(await Notification.countDocuments({ userId: u.id, title: 'New best day' })).toBe(1);

    for (let d = 0; d < 7; d++) await rewardDailyTarget(u.oid, 9000, today + d * DAY_MS);
    const { body } = await request(app).get('/steps/analytics').set(u.auth).expect(200);
    expect(body.records).toMatchObject({ bestDay: { steps: 11_200 }, bestWeek: { steps: 12_000 }, longestStreak: 7 });
    expect(body.badges.map((b: { id: string }) => b.id).sort()).toEqual(['day_10k', 'first_target', 'record_breaker', 'streak_3', 'streak_7']);
    await inbox(u.id, { title: /^Badge earned/ }, 5);
    await new Promise((r) => setTimeout(r, 200));
    expect(await Notification.countDocuments({ userId: u.id, title: /^Badge earned/ })).toBe(5);
  });
});
