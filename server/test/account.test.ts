import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { Challenge, connectDb, HourBucket, Ledger, Notification, Participant, User } from '../src/models.js';
import { redis } from '../src/redis.js';

let repl: MongoMemoryReplSet;
const app = buildApp();

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : undefined,
  });
  await connectDb(repl.getUri('steppool-account-test'));
  await redis().flushdb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await repl?.stop();
  redis().disconnect();
});

async function signUp(email: string, name: string) {
  const { body: otp } = await request(app).post('/auth/otp').send({ email });
  const { body } = await request(app).post('/auth/verify').send({ email, code: otp.devCode }).expect(200);
  const auth = { authorization: `Bearer ${body.tokens.access}` };
  await request(app).patch('/me').set(auth).send({ name }).expect(200);
  return { auth, id: body.me.id as string, refresh: body.tokens.refresh as string };
}

describe('account deletion', () => {
  it('removes personal data, leaves live challenges, and keeps the books balanced', async () => {
    const host = await signUp('host@delete.test', 'Host');
    const leaver = await signUp('leaver@delete.test', 'Leaver');
    const { body: c } = await request(app).post('/challenges').set(host.auth).send({ name: 'Delete Walk', durationHours: 48, entryCredits: 100, visibility: 'public' }).expect(201);
    await request(app).post(`/challenges/${c.id}/join`).set(leaver.auth).expect(200);
    await HourBucket.create({ userId: leaver.id, hour: new Date(), counted: 5000 });
    await Notification.create({ userId: leaver.id, kind: 'announcement', title: 'Hi', body: 'There' });

    await request(app).delete('/me').set(leaver.auth).expect(204);

    expect(await User.exists({ _id: leaver.id })).toBeNull();
    expect(await HourBucket.countDocuments({ userId: leaver.id })).toBe(0);
    expect(await Notification.countDocuments({ userId: leaver.id })).toBe(0);
    expect(await Participant.countDocuments({ userId: leaver.id })).toBe(0);
    expect((await Challenge.findById(c.id))!.players).toBe(1);
    // The entry stays in the pool for the remaining players; the ledger still sums to zero.
    const [sum] = await Ledger.aggregate([{ $group: { _id: null, s: { $sum: '$amount' } } }]);
    expect(sum.s).toBe(0);
    const pool = await Ledger.aggregate([{ $match: { account: `pool:${c.id}` } }, { $group: { _id: null, s: { $sum: '$amount' } } }]);
    expect(pool[0].s).toBe(200);

    // The old session is dead, and signing up again with the same email starts fresh.
    await request(app).post('/auth/refresh').send({ refresh: leaver.refresh }).expect(401);
    const again = await signUp('leaver@delete.test', 'Leaver Again');
    expect(again.id).not.toBe(leaver.id);
  });

  it('refuses while the user still has cash in their wallet', async () => {
    const rich = await signUp('rich@delete.test', 'Rich');
    await User.updateOne({ _id: rich.id }, { $set: { cashPesewas: 2500 } });
    const { body } = await request(app).delete('/me').set(rich.auth).expect(409);
    expect(body.error).toMatch(/Withdraw your GH₵25/);
    expect(await User.exists({ _id: rich.id })).not.toBeNull();
  });
});
