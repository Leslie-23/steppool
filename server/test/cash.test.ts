import { createHmac } from 'node:crypto';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { splitCash } from '../../shared/cash.js';

const SECRET = vi.hoisted(() => {
  process.env.PAID_ENTRY_TESTERS = 'ama@cash.test,kofi@cash.test,yaw@cash.test,esi@cash.test';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_cash';
  return 'sk_test_cash';
});

const { buildApp } = await import('../src/app.js');
const { Challenge, connectDb, HourBucket, Ledger, Payment, Payout, SponsorOrder, User, Withdrawal } = await import('../src/models.js');
const { redis } = await import('../src/redis.js');
const { startChallenge } = await import('../src/lifecycle.js');
const { settleChallenge } = await import('../src/settle.js');
const { HOUR_MS } = await import('../src/verify.js');

describe('splitCash', () => {
  it('refunds everyone in full when nobody, or everybody, hits their goal', () => {
    expect(splitCash(5000, 10, 0)).toEqual({ winnerGets: 5000, loserGets: 5000, rake: 0, remainder: 0 });
    expect(splitCash(5000, 10, 10)).toEqual({ winnerGets: 5000, loserGets: 5000, rake: 0, remainder: 0 });
  });

  it('caps a misser’s loss at 60% and takes 10% of the pool from the forfeits', () => {
    // 10 × GH₵50: 6 missers forfeit GH₵30 each (GH₵180); StepPool takes GH₵50; 4 winners share GH₵130.
    expect(splitCash(5000, 10, 4)).toEqual({ winnerGets: 5000 + 3250, loserGets: 2000, rake: 5000, remainder: 0 });
  });

  it('never leaves a winner below their entry, even with one misser', () => {
    const s = splitCash(5000, 10, 9);
    expect(s.rake).toBe(3000); // capped at what was forfeited
    expect(s.winnerGets).toBe(5000);
  });

  it('always conserves the pool', () => {
    for (const [entry, players, winners] of [[1000, 3, 1], [2000, 7, 3], [5000, 13, 5], [10000, 2, 1], [1000, 11, 10]]) {
      const s = splitCash(entry, players, winners);
      expect(s.winnerGets * winners + s.loserGets * (players - winners) + s.rake + s.remainder).toBe(entry * players);
      expect(s.loserGets).toBeGreaterThanOrEqual(entry * 0.4);
      expect(s.winnerGets).toBeGreaterThanOrEqual(entry);
    }
  });
});

let repl: MongoMemoryReplSet;
let app: ReturnType<typeof buildApp>;

/** Paystack stand-in: initialize returns a checkout URL; verify reports whatever `charges` says. */
const charges = new Map<string, { status: string; amount: number }>();
const transfers: unknown[] = [];
const realFetch = globalThis.fetch;

beforeAll(async () => {
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith('https://api.paystack.co')) return realFetch(url, init);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const ok = (data: unknown) => new Response(JSON.stringify({ status: true, message: 'ok', data }), { status: 200 });
    if (u.endsWith('/transaction/initialize')) return ok({ authorization_url: `https://checkout.paystack.com/${body.reference}`, reference: body.reference });
    if (u.includes('/transaction/verify/')) {
      const ref = decodeURIComponent(u.split('/').pop()!);
      const c = charges.get(ref) ?? { status: 'ongoing', amount: 0 };
      return ok({ reference: ref, currency: 'GHS', ...c });
    }
    if (u.endsWith('/transferrecipient')) return ok({ recipient_code: 'RCP_test' });
    if (u.endsWith('/transfer')) {
      transfers.push(body);
      return ok({ transfer_code: 'TRF_test', status: 'pending' });
    }
    if (u.endsWith('/balance')) return ok([{ currency: 'GHS', balance: 0 }]);
    return new Response(JSON.stringify({ status: false, message: 'not mocked' }), { status: 404 });
  });
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary: process.env.MONGOMS_SYSTEM_BINARY ? { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } : undefined,
  });
  await connectDb(repl.getUri('steppool-cash-test'));
  await redis().flushdb();
  app = buildApp();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await mongoose.disconnect();
  await repl?.stop();
  redis().disconnect();
});

async function signUp(email: string, name: string) {
  const { body: otp } = await request(app).post('/auth/otp').send({ email });
  const { body } = await request(app).post('/auth/verify').send({ email, code: otp.devCode }).expect(200);
  const auth = { authorization: `Bearer ${body.tokens.access}` };
  await request(app).patch('/me').set(auth).send({ name }).expect(200);
  return { auth, id: body.me.id as string };
}

function webhook(event: string, data: Record<string, unknown>) {
  const raw = JSON.stringify({ event, data });
  const sig = createHmac('sha512', SECRET).update(raw).digest('hex');
  return request(app).post('/paystack/webhook').set('content-type', 'application/json').set('x-paystack-signature', sig).send(raw);
}

describe('cash challenges', () => {
  it('are hidden from users who are not testers while the flag is off', async () => {
    const outsider = await signUp('outsider@cash.test', 'Outsider');
    expect((await request(app).get('/me').set(outsider.auth)).body).toMatchObject({ cashEnabled: false });
    await request(app).post('/challenges/cash').set(outsider.auth).send({ name: 'Nope', durationHours: 48, entryPesewas: 1000, visibility: 'public' }).expect(403);
  });

  it('pays in through Paystack, settles 60/10, and withdraws to MoMo', async () => {
    const players = await Promise.all(['ama', 'kofi', 'yaw', 'esi'].map((n) => signUp(`${n}@cash.test`, n[0].toUpperCase() + n.slice(1))));
    const [ama, kofi] = players;
    expect((await request(app).get('/me').set(ama.auth)).body).toMatchObject({ cashEnabled: true, cashPesewas: 0 });

    const { body: c } = await request(app).post('/challenges/cash').set(ama.auth).send({ name: 'Cash walk', durationHours: 48, entryPesewas: 5000, visibility: 'public' }).expect(201);
    expect(c).toMatchObject({ kind: 'cash', entryPesewas: 5000, players: 0 });

    for (const p of players) {
      const { body: join } = await request(app).post(`/cash/challenges/${c.id}/join`).set(p.auth).expect(200);
      expect(join).toMatchObject({ amount: 5000 });
      expect(join.checkoutUrl).toContain(join.reference);
      charges.set(join.reference, { status: 'success', amount: 5000 });
      if (p === kofi) {
        // Kofi's app polls before the webhook lands.
        expect((await request(app).get(`/cash/payments/${join.reference}`).set(p.auth).expect(200)).body).toMatchObject({ status: 'success' });
      }
      await webhook('charge.success', { reference: join.reference, status: 'success', amount: 5000, currency: 'GHS' }).expect(200);
      await webhook('charge.success', { reference: join.reference, status: 'success', amount: 5000, currency: 'GHS' }).expect(200); // retried
    }
    expect(await Ledger.countDocuments({ kind: 'deposit', amount: { $gt: 0 } })).toBe(4); // once each, despite retries
    expect((await Challenge.findById(c.id))!.players).toBe(4);
    expect((await request(app).get(`/challenges/${c.id}`).set(ama.auth)).body.poolCredits).toBe(20000);

    // A forged webhook is rejected.
    await request(app).post('/paystack/webhook').set('x-paystack-signature', 'nope').send({ event: 'charge.success' }).expect(401);

    // Run it: only Ama hits her goal.
    const startsAt = Math.floor(Date.now() / HOUR_MS) * HOUR_MS - 6 * HOUR_MS;
    const endsAt = startsAt + 48 * HOUR_MS;
    await Challenge.updateOne({ _id: c.id }, { $set: { startsAt: new Date(startsAt), endsAt: new Date(endsAt), syncCutoffAt: new Date(endsAt + 2 * HOUR_MS) } });
    await startChallenge(c.id);
    await HourBucket.create({ userId: ama.id, hour: new Date(startsAt), counted: 500_000 });
    await settleChallenge(c.id, new Date(endsAt + 3 * HOUR_MS));

    // 4 × GH₵50 = GH₵200. Three missers forfeit GH₵30 each (GH₵90) and keep GH₵20.
    // StepPool takes 10% of the pool (GH₵20). Ama gets her GH₵50 back plus GH₵70.
    const split = splitCash(5000, 4, 1);
    expect(split).toEqual({ winnerGets: 12000, loserGets: 2000, rake: 2000, remainder: 0 });
    expect((await User.findById(ama.id))!.cashPesewas).toBe(12000);
    expect((await User.findById(kofi.id))!.cashPesewas).toBe(2000);
    const { body: results } = await request(app).get(`/challenges/${c.id}/results`).set(ama.auth).expect(200);
    expect(results).toMatchObject({ perFinisher: 12000, perMisser: 2000, me: { goalHit: true, wonPesewas: 12000 } });

    const [all] = await Ledger.aggregate([{ $match: { currency: 'GHS' } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]);
    expect(all.sum).toBe(0);
    const pool = await Ledger.aggregate([{ $match: { account: `cash:pool:${c.id}` } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]);
    expect(pool[0].sum).toBe(0);
    const house = await Ledger.aggregate([{ $match: { account: 'cash:house' } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]);
    expect(house[0].sum).toBe(2000);

    // Withdraw GH₵100 to MoMo; the transfer fails and the money comes back.
    await request(app).post('/cash/withdraw').set(ama.auth).send({ amount: 20000, momoNumber: '+233241234567', network: 'MTN' }).expect(409);
    const { body: wd } = await request(app).post('/cash/withdraw').set(ama.auth).send({ amount: 10000, momoNumber: '+233241234567', network: 'MTN' }).expect(201);
    expect(transfers).toHaveLength(1);
    expect((await User.findById(ama.id))!.cashPesewas).toBe(2000);
    await webhook('transfer.failed', { reference: wd.reference }).expect(200);
    await webhook('transfer.failed', { reference: wd.reference }).expect(200);
    expect((await User.findById(ama.id))!.cashPesewas).toBe(12000);
    expect((await Withdrawal.findOne({ reference: wd.reference }))!.status).toBe('failed');

    const { body: wallet } = await request(app).get('/cash').set(ama.auth).expect(200);
    expect(wallet).toMatchObject({ enabled: true, balance: 12000, momo: { number: '+233241234567', network: 'MTN' } });
    expect(await Payment.countDocuments({ status: 'success' })).toBe(4);
  });

  it('joins straight from the wallet when it covers the entry', async () => {
    const ama = { auth: { authorization: '' }, id: '' };
    const { body: otp } = await request(app).post('/auth/otp').send({ email: 'ama@cash.test' });
    const { body } = await request(app).post('/auth/verify').send({ email: 'ama@cash.test', code: otp.devCode }).expect(200);
    ama.auth.authorization = `Bearer ${body.tokens.access}`;
    const { body: c } = await request(app).post('/challenges/cash').set(ama.auth).send({ name: 'Wallet walk', durationHours: 48, entryPesewas: 1000, visibility: 'private' }).expect(201);
    const { body: join } = await request(app).post(`/cash/challenges/${c.id}/join`).set(ama.auth).expect(200);
    expect(join.joined).toMatchObject({ players: 1, poolCredits: 1000 });
    expect((await request(app).get('/me').set(ama.auth)).body.cashPesewas).toBe(11000);
  });
});

const ADMIN = { 'x-admin-key': 'dev-admin' };

describe('cash challenge visibility', () => {
  it('a non-tester cannot see a cash challenge even with its code', async () => {
    const outsider = await signUp('peek@cash.test', 'Peek');
    const c = await Challenge.findOne({ kind: 'cash' });
    await request(app).get(`/challenges/code/${c!.inviteCode}`).set(outsider.auth).expect(404);
    await request(app).get(`/challenges/${c!._id}`).set(outsider.auth).expect(404);
  });
});

describe('sponsors', () => {
  it('pay online, get a live public challenge, and winners are paid through Paystack', async () => {
    const { body: quote } = await request(app).get('/sponsor/quote?prize=1000').expect(200);
    expect(quote).toMatchObject({ prize: 100000, fee: 15000, total: 115000, feePct: 15 });

    const { body: order } = await request(app)
      .post('/sponsor/checkout')
      .send({ company: 'Kasapreko', email: 'brand@kasa.test', challengeName: 'Kasa Week', prizeDescription: 'GH₵1,000 shared', prizeValueGhs: 1000, maxWinners: 2, durationHours: 48 })
      .expect(201);
    expect(order).toMatchObject({ total: 115000 });
    expect((await request(app).get(`/sponsor/orders/${order.reference}`).expect(200)).body).toMatchObject({ status: 'pending', challenge: null });

    await webhook('charge.success', { reference: order.reference, status: 'success', amount: 115000, currency: 'GHS' }).expect(200);
    await webhook('charge.success', { reference: order.reference, status: 'success', amount: 115000, currency: 'GHS' }).expect(200);
    const { body: done } = await request(app).get(`/sponsor/orders/${order.reference}`).expect(200);
    expect(done.status).toBe('paid');
    expect(done.challenge.inviteCode).toHaveLength(6);
    expect(await Challenge.countDocuments({ kind: 'sponsored', name: 'Kasa Week' })).toBe(1);

    // A walker joins, hits the goal, claims, and the admin sends the prize.
    const w = await signUp('kasa-walker@cash.test', 'Abena');
    const c = (await SponsorOrder.findOne({ reference: order.reference }))!.challengeId!;
    await request(app).post(`/challenges/${c}/join`).set(w.auth).expect(200);
    const startsAt = Math.floor(Date.now() / HOUR_MS) * HOUR_MS - 6 * HOUR_MS;
    const endsAt = startsAt + 48 * HOUR_MS;
    await Challenge.updateOne({ _id: c }, { $set: { startsAt: new Date(startsAt), endsAt: new Date(endsAt), syncCutoffAt: new Date(endsAt + 2 * HOUR_MS) } });
    await startChallenge(String(c));
    await HourBucket.create({ userId: w.id, hour: new Date(startsAt + HOUR_MS), counted: 500_000 });
    await settleChallenge(String(c), new Date(endsAt + 3 * HOUR_MS));
    const payout = (await Payout.findOne({ challengeId: c, userId: w.id }))!;
    expect(payout.amount).toBe(1000);
    await request(app).post(`/payouts/${payout._id}/claim`).set(w.auth).send({ momoNumber: '+233201234567', network: 'telecel' }).expect(200);

    const { body: list } = await request(app).get('/admin/payouts?status=claimed').set(ADMIN).expect(200);
    expect(list.find((p: { id: string }) => p.id === String(payout._id))).toMatchObject({ funded: true });
    transfers.length = 0;
    const { body: sent } = await request(app).post(`/admin/payouts/${payout._id}/send`).set(ADMIN).expect(200);
    expect(transfers[0]).toMatchObject({ amount: 100000, recipient: 'RCP_test' });
    expect((await Payout.findById(payout._id))!.status).toBe('sending');
    await request(app).post(`/admin/payouts/${payout._id}/send`).set(ADMIN).expect(404); // not twice
    await webhook('transfer.success', { reference: sent.reference }).expect(200);
    expect((await Payout.findById(payout._id))!.status).toBe('fulfilled');

    // The money page adds up: everything that came in is either held or earned.
    const { body: money } = await request(app).get('/admin/money').set(ADMIN).expect(200);
    expect(money.earnings).toMatchObject({ rake: 2000, sponsorFees: 15000 });
    expect(money.held.prizes).toBe(0);
    expect(money.expectedAtPaystack).toBe(money.held.total + money.earnings.total);
    expect(money.sponsorOrders[0]).toMatchObject({ company: 'Kasapreko', status: 'paid', prize: 100000, fee: 15000 });
  });

  it('a failed prize transfer goes back to "to pay" with the money held again', async () => {
    const c = await Challenge.findOne({ name: 'Kasa Week' });
    const p = await Payout.findOne({ challengeId: c!._id });
    await Payout.updateOne({ _id: p!._id }, { $set: { status: 'claimed' } });
    await Ledger.create([
      { txId: 'reset', account: 'cash:paystack', amount: -100000, currency: 'GHS', kind: 'prize_payout_reversal' },
      { txId: 'reset', account: 'cash:prizes', amount: 100000, currency: 'GHS', kind: 'prize_payout_reversal' },
    ]);
    const { body: sent } = await request(app).post(`/admin/payouts/${p!._id}/send`).set(ADMIN).expect(200);
    await webhook('transfer.failed', { reference: sent.reference, reason: 'Invalid account' }).expect(200);
    const after = (await Payout.findById(p!._id))!;
    expect(after).toMatchObject({ status: 'claimed', lastError: 'Invalid account' });
    const { body: money } = await request(app).get('/admin/money').set(ADMIN).expect(200);
    expect(money.held.prizes).toBe(100000);
  });
});
