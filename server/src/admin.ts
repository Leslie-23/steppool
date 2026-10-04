import { Router } from 'express';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { Types } from 'mongoose';
import { z } from 'zod';

import { DAY_MS } from '../../shared/contracts.js';

import { requireAdmin } from './auth.js';
import { HttpError } from './errors.js';
import { config } from './config.js';
import { account, cash, inTransaction, transfer } from './ledger.js';
import { Challenge, HourBucket, Ledger, Notification, Participant, Payment, Payout, SponsorOrder, User, Withdrawal } from './models.js';
import { paystack } from './paystack.js';
import { toMe } from './views.js';

/** The web console's API. Every route requires an admin (role or API key). */
export const consoleRouter = Router();
consoleRouter.use(requireAdmin);

const dayStart = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;
const iso = (d: number) => new Date(d).toISOString().slice(0, 10);

consoleRouter.get('/metrics', async (_req, res) => {
  const today = dayStart(Date.now());
  const from30 = new Date(today - 29 * DAY_MS);
  const [users, new7, active, live, settled, credits, claims, signups, dau, stepsToday, joins7] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ createdAt: { $gte: new Date(today - 6 * DAY_MS) } }),
    HourBucket.aggregate<{ _id: null; d1: number; d7: number }>([
      { $match: { counted: { $gt: 0 }, hour: { $gte: new Date(today - 6 * DAY_MS) } } },
      { $group: { _id: '$userId', last: { $max: '$hour' } } },
      { $group: { _id: null, d7: { $sum: 1 }, d1: { $sum: { $cond: [{ $gte: ['$last', new Date(today)] }, 1, 0] } } } },
    ]),
    Challenge.countDocuments({ status: 'live' }),
    Participant.aggregate<{ _id: string; n: number }>([{ $match: { status: { $in: ['finished', 'missed'] } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    User.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$credits' } } }]),
    Payout.countDocuments({ status: 'claimed' }),
    User.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: from30 } } },
      { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }, n: { $sum: 1 } } },
    ]),
    HourBucket.aggregate<{ _id: string; n: number }>([
      { $match: { counted: { $gt: 0 }, hour: { $gte: from30 } } },
      { $group: { _id: { d: { $dateToString: { date: '$hour', format: '%Y-%m-%d' } }, u: '$userId' } } },
      { $group: { _id: '$_id.d', n: { $sum: 1 } } },
    ]),
    HourBucket.aggregate<{ total: number }>([{ $match: { hour: { $gte: new Date(today) } } }, { $group: { _id: null, total: { $sum: '$counted' } } }]),
    Participant.countDocuments({ createdAt: { $gte: new Date(today - 6 * DAY_MS) } }),
  ]);
  const finished = settled.find((s) => s._id === 'finished')?.n ?? 0;
  const missed = settled.find((s) => s._id === 'missed')?.n ?? 0;
  const series = (rows: { _id: string; n: number }[]) =>
    Array.from({ length: 30 }, (_, i) => {
      const day = iso(from30.getTime() + i * DAY_MS);
      return { day, n: rows.find((r) => r._id === day)?.n ?? 0 };
    });
  res.json({
    users,
    newUsers7d: new7,
    activeToday: active[0]?.d1 ?? 0,
    active7d: active[0]?.d7 ?? 0,
    liveChallenges: live,
    joins7d: joins7,
    completionRate: finished + missed ? finished / (finished + missed) : null,
    creditsInCirculation: credits[0]?.total ?? 0,
    payoutsToFulfil: claims,
    stepsToday: stepsToday[0]?.total ?? 0,
    signups: series(signups),
    dailyActive: series(dau),
  });
});

consoleRouter.get('/users', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const page = Math.max(0, Number(req.query.page ?? 0) || 0);
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = q ? { $or: [{ email: { $regex: esc, $options: 'i' } }, { name: { $regex: esc, $options: 'i' } }, ...(Types.ObjectId.isValid(q) ? [{ _id: new Types.ObjectId(q) }] : [])] } : {};
  const [rows, total] = await Promise.all([
    User.find(filter, { email: 1, name: 1, credits: 1, role: 1, baselineDaily: 1, createdAt: 1, appleSub: 1, googleSub: 1 }).sort({ createdAt: -1 }).skip(page * 50).limit(50).lean(),
    User.countDocuments(filter),
  ]);
  res.json({
    total,
    users: rows.map((u) => ({
      id: String(u._id),
      email: u.email,
      name: u.name,
      credits: u.credits ?? 0,
      role: u.role ?? 'user',
      baselineDaily: u.baselineDaily ?? 0,
      providers: ['email', ...(u.appleSub ? ['apple'] : []), ...(u.googleSub ? ['google'] : [])],
      createdAt: (u as unknown as { createdAt: Date }).createdAt,
    })),
  });
});

const byId = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'No such user');
  const u = await User.findById(id);
  if (!u) throw new HttpError(404, 'No such user');
  return u;
};

consoleRouter.get('/users/:id', async (req, res) => {
  const u = await byId(req.params.id);
  const [ledger, parts] = await Promise.all([
    Ledger.find({ account: account.user(u._id) }).sort({ createdAt: -1 }).limit(50).lean(),
    Participant.find({ userId: u._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const names = new Map((await Challenge.find({ _id: { $in: parts.map((p) => p.challengeId) } }, { name: 1, status: 1 }).lean()).map((c) => [String(c._id), c]));
  res.json({
    user: { ...toMe(u), createdAt: (u as unknown as { createdAt: Date }).createdAt },
    ledger: ledger.map((l) => ({ id: String(l._id), amount: l.amount, kind: l.kind, note: l.note, at: (l.createdAt as Date).toISOString() })),
    challenges: parts.map((p) => ({ id: String(p.challengeId), name: names.get(String(p.challengeId))?.name ?? '?', status: p.status, steps: p.steps ?? 0, goal: p.goal, heldSteps: p.heldSteps ?? 0 })),
  });
});

/** Grant credits by hand. Recorded in the ledger with the reason and the admin who did it. */
consoleRouter.post('/users/:id/credits', async (req, res) => {
  const { amount, reason } = z.object({ amount: z.number().int().min(1).max(100_000), reason: z.string().trim().min(3).max(140) }).parse(req.body);
  const u = await byId(req.params.id);
  const by = req.userId ? new Types.ObjectId(req.userId) : undefined;
  await inTransaction((session) => transfer(session, { from: account.mint, to: account.user(u._id), amount, kind: 'admin_grant', note: reason, by }));
  const fresh = (await User.findById(u._id))!;
  res.json({ credits: fresh.credits });
});

/** Grant credits to everyone (e.g. a launch gift). Same audit trail, one ledger transfer per user. */
consoleRouter.post('/credits/all', async (req, res) => {
  const { amount, reason } = z.object({ amount: z.number().int().min(1).max(10_000), reason: z.string().trim().min(3).max(140) }).parse(req.body);
  const by = req.userId ? new Types.ObjectId(req.userId) : undefined;
  let count = 0;
  for await (const u of User.find({}, { _id: 1 }).lean().cursor()) {
    await inTransaction((session) => transfer(session, { from: account.mint, to: account.user(u._id), amount, kind: 'admin_grant', note: reason, by }));
    count++;
  }
  res.json({ users: count, total: count * amount });
});

const expo = new Expo();

/**
 * Broadcast an announcement: into every inbox, and pushed to everyone who has push enabled
 * and hasn't switched announcements off. Pushes go out in Expo's recommended chunks.
 */
consoleRouter.post('/broadcast', async (req, res) => {
  const { title, body, challengeId } = z
    .object({ title: z.string().trim().min(2).max(80), body: z.string().trim().min(2).max(240), challengeId: z.string().regex(/^[a-f0-9]{24}$/).optional() })
    .parse(req.body);
  const data = challengeId ? { challengeId } : undefined;
  let inbox = 0;
  const pushes: ExpoPushMessage[] = [];
  let batch: { userId: Types.ObjectId; kind: string; title: string; body: string; data?: Record<string, string> }[] = [];
  const flush = async () => {
    if (!batch.length) return;
    await Notification.insertMany(batch, { ordered: false });
    inbox += batch.length;
    batch = [];
  };
  for await (const u of User.find({}, { pushToken: 1, notifPrefs: 1 }).lean().cursor()) {
    batch.push({ userId: u._id, kind: 'announcement', title, body, data });
    if (batch.length >= 500) await flush();
    if (u.pushToken && Expo.isExpoPushToken(u.pushToken) && u.notifPrefs?.announcement !== false) {
      pushes.push({ to: u.pushToken, title, body, data: { ...data, kind: 'announcement' }, sound: 'default', channelId: 'challenges' });
    }
  }
  await flush();
  let pushed = 0;
  for (const chunk of expo.chunkPushNotifications(pushes)) {
    const tickets = await expo.sendPushNotificationsAsync(chunk).catch(() => []);
    pushed += tickets.filter((t) => t.status === 'ok').length;
  }
  res.json({ inbox, pushed, pushTargets: pushes.length });
});

/** Sends one push to one user and waits for Expo's receipt, so the console shows exactly where delivery fails. */
consoleRouter.post('/users/:id/test-push', async (req, res) => {
  const u = await User.findById(req.params.id, { pushToken: 1 }).lean();
  if (!u) return void res.status(404).json({ error: 'No such user' });
  if (!u.pushToken) return void res.json({ ok: false, step: 'token', detail: 'No push token: the user has not allowed notifications on a device yet' });
  if (!Expo.isExpoPushToken(u.pushToken)) return void res.json({ ok: false, step: 'token', detail: `Not an Expo token: ${u.pushToken}` });
  const [ticket] = await expo.sendPushNotificationsAsync([{ to: u.pushToken, title: 'StepPool test', body: 'Push notifications are working.', sound: 'default', channelId: 'challenges', data: { kind: 'announcement' } }]);
  if (ticket.status !== 'ok') return void res.json({ ok: false, step: 'ticket', detail: `${ticket.message} ${ticket.details?.error ?? ''}`.trim() });
  await new Promise((r) => setTimeout(r, 5000));
  const receipt = (await expo.getPushNotificationReceiptsAsync([ticket.id]))[ticket.id];
  if (!receipt) return void res.json({ ok: true, step: 'sent', detail: 'Accepted by Expo; Apple/Google receipt not ready yet' });
  if (receipt.status !== 'ok') return void res.json({ ok: false, step: 'receipt', detail: `${receipt.message} ${receipt.details?.error ?? ''}`.trim() });
  res.json({ ok: true, step: 'delivered', detail: `Delivered to Apple/Google for ${u.pushToken.slice(0, 30)}…` });
});

/**
 * Real money, in pesewas. Every cedi StepPool has taken in sits in exactly one bucket: players' wallets,
 * live challenge pools, held sponsor prizes, or StepPool's own earnings. Together they should equal what
 * Paystack is holding for us (minus anything StepPool has already settled out of its earnings).
 */
consoleRouter.get('/money', async (_req, res) => {
  const sumBy = (match: object) => Ledger.aggregate<{ _id: string; total: number }>([{ $match: match }, { $group: { _id: '$kind', total: { $sum: '$amount' } } }]);
  const today = dayStart(Date.now());
  const from30 = new Date(today - 29 * DAY_MS);
  const [house, wallets, pools, prizes, atPaystack, deposits, withdrawals, pendingW, orders, prizeLiability, daily] = await Promise.all([
    sumBy({ account: cash.house }),
    User.aggregate<{ total: number; n: number }>([{ $match: { cashPesewas: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$cashPesewas' }, n: { $sum: 1 } } }]),
    Ledger.aggregate<{ total: number }>([{ $match: { account: { $regex: '^cash:pool:' } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Ledger.aggregate<{ total: number }>([{ $match: { account: cash.prizes } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Ledger.aggregate<{ total: number }>([{ $match: { account: cash.paystack } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate<{ total: number; n: number }>([{ $match: { status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Withdrawal.aggregate<{ _id: string; total: number; n: number }>([{ $group: { _id: '$status', total: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Withdrawal.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(20).lean(),
    SponsorOrder.find({}).sort({ createdAt: -1 }).limit(30).lean(),
    Payout.aggregate<{ total: number }>([{ $match: { kind: 'sponsor_prize', status: { $in: ['pending', 'claimed', 'sending'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Ledger.aggregate<{ _id: string; total: number }>([
      { $match: { account: cash.house, createdAt: { $gte: from30 } } },
      { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }, total: { $sum: '$amount' } } },
    ]),
  ]);
  const by = (rows: { _id: string; total: number }[], k: string) => rows.find((r) => r._id === k)?.total ?? 0;
  const earnings = { rake: by(house, 'rake'), sponsorFees: by(house, 'sponsor_fee'), rounding: by(house, 'house_remainder') };
  const held = { wallets: wallets[0]?.total ?? 0, walletsUsers: wallets[0]?.n ?? 0, pools: pools[0]?.total ?? 0, prizes: prizes[0]?.total ?? 0 };
  let paystackBalance: number | null = null;
  if (config.paystackSecret) {
    const bal = await paystack<{ currency: string; balance: number }[]>('/balance').catch(() => null);
    paystackBalance = bal?.find((b) => b.currency === 'GHS')?.balance ?? null;
  }
  const users = await User.find({ _id: { $in: pendingW.map((w) => w.userId) } }, { name: 1, email: 1 }).lean();
  const uname = new Map(users.map((u) => [String(u._id), u.name || u.email]));
  res.json({
    enabled: { paidEntry: config.paidEntryEnabled, testers: config.paidEntryTesters.length, paystack: !!config.paystackSecret, sponsorFeePct: config.sponsorFeePct },
    earnings: { ...earnings, total: earnings.rake + earnings.sponsorFees + earnings.rounding },
    held: { ...held, total: held.wallets + held.pools + held.prizes },
    // cash:paystack goes negative as money comes in; its negation is what should be sitting at Paystack.
    expectedAtPaystack: -(atPaystack[0]?.total ?? 0),
    paystackBalance,
    deposits: { total: deposits[0]?.total ?? 0, n: deposits[0]?.n ?? 0 },
    withdrawals: {
      sent: by(withdrawals, 'success'),
      sentN: withdrawals.find((w) => w._id === 'success')?.n ?? 0,
      pending: by(withdrawals, 'pending'),
      failedN: withdrawals.find((w) => w._id === 'failed')?.n ?? 0,
      pendingList: pendingW.map((w) => ({ id: String(w._id), name: uname.get(String(w.userId)) ?? '', amount: w.amount, network: w.network, momoNumber: w.momoNumber, at: w.createdAt })),
    },
    sponsorPrizesOwed: Math.round((prizeLiability[0]?.total ?? 0) * 100),
    sponsorOrders: orders.map((o) => ({
      id: String(o._id),
      company: o.company,
      email: o.email,
      challengeName: o.challengeName,
      prize: o.prizePesewas,
      fee: o.feePesewas,
      status: o.status,
      challengeId: o.challengeId ? String(o.challengeId) : null,
      at: o.createdAt,
    })),
    earningsDaily: Array.from({ length: 30 }, (_, i) => {
      const day = iso(from30.getTime() + i * DAY_MS);
      return { day, n: daily.find((r) => r._id === day)?.total ?? 0 };
    }),
  });
});

consoleRouter.get('/challenges', async (_req, res) => {
  const rows = await Challenge.find({}).sort({ createdAt: -1 }).limit(100).lean();
  const pools = new Map(
    (
      await Ledger.aggregate<{ _id: string; total: number }>([
        { $match: { account: { $in: rows.map((c) => (c.kind === 'cash' ? cash.pool(c._id) : account.pool(c._id))) } } },
        { $group: { _id: '$account', total: { $sum: '$amount' } } },
      ])
    ).map((p) => [p._id.slice(p._id.lastIndexOf(':') + 1), p.total]),
  );
  res.json(
    rows.map((c) => ({
      id: String(c._id),
      name: c.name,
      kind: c.kind,
      status: c.status,
      visibility: c.visibility,
      inviteCode: c.inviteCode,
      players: c.players ?? 0,
      finishers: c.finishers ?? null,
      entryCredits: c.entryCredits ?? 0,
      /** Cash challenges: entry and pool are in pesewas. */
      entryPesewas: c.entryPesewas ?? 0,
      pool: c.kind === 'cash' && c.status === 'settled' ? (c.players ?? 0) * (c.entryPesewas ?? 0) : (pools.get(String(c._id)) ?? 0),
      paidOnline: !!c.sponsorOrderId,
      sponsor: c.sponsor?.name ?? null,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
    })),
  );
});
