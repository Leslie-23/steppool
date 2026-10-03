import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DAY_MS } from '../../shared/contracts.js';
import { buildApp } from '../src/app.js';
import { connectDb, Ledger, Notification, User } from '../src/models.js';
import { redis } from '../src/redis.js';
import { rewardDailyTarget, weeklyTopup } from '../src/rewards.js';

let repl: MongoMemoryReplSet;
const app = buildApp();

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : undefined,
  });
  await connectDb(repl.getUri('steppool-economy-test'));
  await redis().flushdb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await repl?.stop();
  redis().disconnect();
});

async function signUp(email: string, name = 'Walker') {
  const { body: otp } = await request(app).post('/auth/otp').send({ email });
  const { body } = await request(app).post('/auth/verify').send({ email, code: otp.devCode }).expect(200);
  const auth = { authorization: `Bearer ${body.tokens.access}` };
  await request(app).patch('/me').set(auth).send({ name }).expect(200);
  return { auth, id: body.me.id as string, me: body.me };
}
const me = async (auth: Record<string, string>) => (await request(app).get('/me').set(auth).expect(200)).body;

describe('own daily target', () => {
  it('can be set within bounds and reset to the derived target', async () => {
    const u = await signUp('target@example.com');
    expect((await me(u.auth)).dailyTarget).toBe(7000);
    const { body } = await request(app).patch('/me').set(u.auth).send({ dailyTarget: 12000 }).expect(200);
    expect(body).toMatchObject({ dailyTarget: 12000, dailyTargetCustom: true });
    await request(app).patch('/me').set(u.auth).send({ dailyTarget: 1000 }).expect(400);
    const { body: reset } = await request(app).patch('/me').set(u.auth).send({ dailyTarget: null }).expect(200);
    expect(reset).toMatchObject({ dailyTarget: 7000, dailyTargetCustom: false });
  });
});

describe('earning credits', () => {
  it('pays +20 once per day for hitting the target, and +100 on the 7th day in a row', async () => {
    const u = await signUp('earner@example.com');
    const id = new mongoose.Types.ObjectId(u.id);
    const start = Date.UTC(2026, 9, 1, 12);
    for (let d = 0; d < 7; d++) {
      await rewardDailyTarget(id, 9000, start + d * DAY_MS);
      await rewardDailyTarget(id, 9500, start + d * DAY_MS); // a second sync the same day pays nothing
    }
    await rewardDailyTarget(id, 100, start + 7 * DAY_MS); // under target: nothing
    expect((await me(u.auth)).credits).toBe(1000 + 7 * 20 + 100);
    expect(await Ledger.countDocuments({ account: `user:${u.id}`, kind: 'streak_bonus' })).toBe(1);
  });

  it('tops anyone under 200 back up on Monday, once per week', async () => {
    const u = await signUp('broke@example.com');
    await User.updateOne({ _id: u.id }, { $set: { credits: 30 } });
    await Ledger.create({ txId: 'test-drain', account: `user:${u.id}`, amount: -970, kind: 'entry' }, { txId: 'test-drain', account: 'house', amount: 970, kind: 'entry' });
    const monday = Date.UTC(2026, 9, 5, 6);
    expect(await weeklyTopup(monday)).toBeGreaterThanOrEqual(1);
    expect(await weeklyTopup(monday + 3600_000)).toBe(0); // same week again: no double pay
    expect((await me(u.auth)).credits).toBe(200);
  });

  it('pays +100 to both people for a referral, exactly once', async () => {
    const inviter = await signUp('inviter@example.com', 'Abena Inviter');
    const code = (await me(inviter.auth)).referralCode;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const newbie = await signUp('newbie@example.com', 'Kojo New');
    await request(app).post('/me/referral').set(newbie.auth).send({ code: code.toLowerCase() }).expect(200);
    await request(app).post('/me/referral').set(newbie.auth).send({ code }).expect(409);
    await request(app).post('/me/referral').set(inviter.auth).send({ code }).expect(404); // own code
    expect((await me(newbie.auth)).credits).toBe(1100);
    expect((await me(inviter.auth)).credits).toBe(1100);
  });
});

describe('admin console', () => {
  it('only admins get in; allow-listed emails become admins on sign-in', async () => {
    const pleb = await signUp('pleb@example.com');
    await request(app).get('/admin/metrics').set(pleb.auth).expect(403);
    await request(app).get('/admin/metrics').expect(401);
    const boss = await signUp('boss@steppool.app', 'The Boss');
    expect(boss.me.role).toBe('admin');
    const { body } = await request(app).get('/admin/metrics').set(boss.auth).expect(200);
    expect(body.users).toBeGreaterThan(0);
    expect(body.signups).toHaveLength(30);
  });

  it('grants credits with an audit trail and keeps the ledger balanced', async () => {
    const boss = await signUp('boss@steppool.app', 'The Boss');
    const target = await signUp('lucky@example.com');
    const { body: found } = await request(app).get('/admin/users').query({ q: 'lucky@' }).set(boss.auth).expect(200);
    expect(found.users[0].id).toBe(target.id);
    const { body } = await request(app).post(`/admin/users/${target.id}/credits`).set(boss.auth).send({ amount: 500, reason: 'Pilot thank-you' }).expect(200);
    expect(body.credits).toBe(1500);
    const line = await Ledger.findOne({ account: `user:${target.id}`, kind: 'admin_grant' }).lean();
    expect(line).toMatchObject({ amount: 500, note: 'Pilot thank-you' });
    expect(String(line?.by)).toBe(boss.id);
    const { body: check } = await request(app).get('/admin/ledger/check').set(boss.auth).expect(200);
    expect(check.mismatchedUsers).toEqual([]);
  });

  it('broadcasts an announcement into every inbox', async () => {
    const boss = await signUp('boss@steppool.app', 'The Boss');
    const users = await User.countDocuments({});
    const { body } = await request(app).post('/admin/broadcast').set(boss.auth).send({ title: 'Launch week', body: 'Double credits all week.' }).expect(200);
    expect(body.inbox).toBe(users);
    expect(await Notification.countDocuments({ kind: 'announcement', title: 'Launch week' })).toBe(users);
  });
});
