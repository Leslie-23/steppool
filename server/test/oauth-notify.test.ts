import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { connectDb, Notification, User } from '../src/models.js';
import { setProviderVerifierForTests, type ProviderClaims } from '../src/oauth.js';
import { deliver } from '../src/push.js';
import { redis } from '../src/redis.js';

let repl: MongoMemoryReplSet;
const app = buildApp();
// Tokens in these tests are just JSON claims; the seam stands in for Apple/Google signature checks.
const fake = (c: ProviderClaims) => JSON.stringify(c).padEnd(24, ' ');

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : undefined,
  });
  await connectDb(repl.getUri('steppool-oauth-test'));
  await redis().flushdb();
  setProviderVerifierForTests(async (_p, token) => JSON.parse(token.trim()) as ProviderClaims);
});

afterAll(async () => {
  setProviderVerifierForTests(null);
  await mongoose.disconnect();
  await repl?.stop();
  redis().disconnect();
});

describe('Sign in with Apple / Google', () => {
  it('creates an account with signup credits and the provider name, then signs the same person back in', async () => {
    const token = fake({ sub: 'apple-001', email: 'kofi@privaterelay.appleid.com', emailVerified: true });
    const { body: first } = await request(app).post('/auth/apple').send({ identityToken: token, name: 'Kofi Mensah' }).expect(200);
    expect(first.isNew).toBe(true);
    expect(first.me).toMatchObject({ name: 'Kofi Mensah', credits: 1000, providers: ['email', 'apple'] });
    const { body: again } = await request(app).post('/auth/apple').send({ identityToken: token }).expect(200);
    expect(again.isNew).toBe(false);
    expect(again.me.id).toBe(first.me.id);
  });

  it('links Google to an existing email account when Google has verified the email', async () => {
    const { body: otp } = await request(app).post('/auth/otp').send({ email: 'ama@example.com' });
    const { body: emailLogin } = await request(app).post('/auth/verify').send({ email: 'ama@example.com', code: otp.devCode });
    const { body } = await request(app).post('/auth/google').send({ idToken: fake({ sub: 'g-777', email: 'Ama@Example.com', emailVerified: true, name: 'Ama' }) }).expect(200);
    expect(body.isNew).toBe(false);
    expect(body.me.id).toBe(emailLogin.me.id);
    expect(body.me.providers).toEqual(['email', 'google']);
    expect(await User.countDocuments({ email: 'ama@example.com' })).toBe(1);
  });

  it('never links on an unverified email, so nobody can claim an account by asserting an address', async () => {
    const { body: otp } = await request(app).post('/auth/otp').send({ email: 'victim@example.com' });
    const { body: victim } = await request(app).post('/auth/verify').send({ email: 'victim@example.com', code: otp.devCode });
    const { body } = await request(app).post('/auth/google').send({ idToken: fake({ sub: 'g-evil', email: 'victim@example.com', emailVerified: false }) }).expect(200);
    expect(body.me.id).not.toBe(victim.me.id);
    expect(body.me.email).toBe('google.g-evil@users.steppool.app');
  });

  it('handles Apple withholding the email entirely', async () => {
    const { body } = await request(app).post('/auth/apple').send({ identityToken: fake({ sub: 'apple-hidden', emailVerified: false }) }).expect(200);
    expect(body.me.email).toBe('apple.apple-hidden@users.steppool.app');
  });

  it('rejects tokens that fail verification', async () => {
    setProviderVerifierForTests(null); // real verifier: this is not a valid Apple JWT
    await request(app).post('/auth/apple').send({ identityToken: 'x'.repeat(40) }).expect(401);
    setProviderVerifierForTests(async (_p, token) => JSON.parse(token.trim()) as ProviderClaims);
  });
});

describe('notifications', () => {
  async function user(sub: string, name: string) {
    const { body } = await request(app).post('/auth/apple').send({ identityToken: fake({ sub, email: `${sub}@example.com`, emailVerified: true }), name }).expect(200);
    return { auth: { authorization: `Bearer ${body.tokens.access}` }, id: body.me.id as string };
  }

  it('tells the creator when someone joins, in the inbox, and marks read', async () => {
    const creator = await user('c-1', 'Creator Kwesi');
    const friend = await user('f-1', 'Friend Esi');
    const { body: c } = await request(app).post('/challenges').set(creator.auth).send({ name: 'Inbox Walk', durationHours: 48, entryCredits: 0, visibility: 'private' }).expect(201);
    await request(app).post(`/challenges/${c.id}/join`).set(friend.auth).expect(200);
    await new Promise((r) => setTimeout(r, 300)); // notify is fire-and-forget

    const { body: inbox } = await request(app).get('/notifications').set(creator.auth).expect(200);
    expect(inbox.unread).toBe(1);
    expect(inbox.items[0]).toMatchObject({ kind: 'joins', title: 'Friend joined Inbox Walk', challengeId: c.id, read: false });

    const { body: after } = await request(app).post('/notifications/read').set(creator.auth).send({}).expect(200);
    expect(after.unread).toBe(0);
  });

  it('merges preference toggles one key at a time and still records muted kinds in the inbox', async () => {
    const u = await user('p-1', 'Prefs Person');
    const { body: me } = await request(app).patch('/me').set(u.auth).send({ notifPrefs: { overtake: false } }).expect(200);
    expect(me.notifPrefs).toEqual({ goal: true, overtake: false, reminder: true, results: true, joins: true, announcement: true });
    const { body: me2 } = await request(app).patch('/me').set(u.auth).send({ notifPrefs: { joins: false } }).expect(200);
    expect(me2.notifPrefs.overtake).toBe(false); // not reset by the second toggle
    await deliver(u.id, 'overtake', { title: 'Someone passed you', body: 'Muted for push, kept in the inbox' });
    expect(await Notification.countDocuments({ userId: u.id, kind: 'overtake' })).toBe(1);
  });
});
