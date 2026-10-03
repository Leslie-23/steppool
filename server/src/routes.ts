import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

import { DAY_MS, IngestBody, type Analytics, type InboxItem, type LedgerLine, type NotificationKind, type Payout as PayoutView } from '../../shared/contracts.js';
import { CREDITS, MAX_CUSTOM_DAILY, MIN_CUSTOM_DAILY } from '../../shared/goals.js';

import { limit, requireUser } from './auth.js';
import { HttpError } from './errors.js';
import { account } from './ledger.js';
import { Challenge, HourBucket, Ledger, Notification, Participant, Payout, User } from './models.js';
import { dailyTotals, ingest } from './steps.js';
import { notify } from './push.js';
import { canRedeemReferral, award, ensureReferralCode, targetFor } from './rewards.js';
import { toMe } from './views.js';

export const meRouter = Router();
meRouter.use(requireUser);

meRouter.get('/', async (req, res) => {
  const u = await User.findById(req.userId);
  if (!u) throw new HttpError(401, 'Sign in again');
  if (!u.referralCode) u.referralCode = await ensureReferralCode(u);
  res.json(toMe(u));
});

/** Enter a friend's referral code (once, within 7 days of joining): +100 credits each. */
meRouter.post('/referral', async (req, res) => {
  const { code } = z.object({ code: z.string().trim().toUpperCase().length(6) }).parse(req.body);
  const me = await User.findById(req.userId);
  if (!me) throw new HttpError(401, 'Sign in again');
  if (!canRedeemReferral(me as typeof me & { createdAt?: Date })) throw new HttpError(409, 'Referral codes can only be used once, in your first week');
  const friend = await User.findOne({ referralCode: code });
  if (!friend || friend._id.equals(me._id)) throw new HttpError(404, 'No one has that referral code');
  // Claim first so a double tap can't pay twice.
  const claimed = await User.updateOne({ _id: me._id, referredBy: { $exists: false } }, { $set: { referredBy: friend._id } });
  if (!claimed.modifiedCount) throw new HttpError(409, 'Referral already used');
  await award(me._id, CREDITS.referral, 'referral', `referral:new:${me._id}`, `Joined with ${friend.name || 'a friend'}'s code`);
  await award(friend._id, CREDITS.referral, 'referral', `referral:by:${me._id}`, `${me.name || 'A friend'} joined with your code`);
  notify(friend._id, 'announcement', { title: `+${CREDITS.referral} credits`, body: `${me.name || 'A friend'} joined with your code.` });
  res.json(toMe((await User.findById(me._id))!));
});

meRouter.patch('/', async (req, res) => {
  const patch = z
    .object({
      name: z.string().trim().min(2).max(24).optional(),
      avatar: z.string().url().max(500).optional(),
      pushToken: z.string().max(200).optional(),
      /** Own daily target, or null to go back to "derive from my usual pace". */
      dailyTarget: z.number().int().min(MIN_CUSTOM_DAILY).max(MAX_CUSTOM_DAILY).nullable().optional(),
      notifPrefs: z
        .object({ goal: z.boolean(), overtake: z.boolean(), reminder: z.boolean(), results: z.boolean(), joins: z.boolean(), announcement: z.boolean() })
        .partial()
        .optional(),
    })
    .parse(req.body);
  // Prefs merge key by key so toggling one never resets the others.
  const { notifPrefs, dailyTarget, ...rest } = patch;
  const set: Record<string, unknown> = { ...rest };
  const unset: Record<string, ''> = {};
  for (const [k, v] of Object.entries(notifPrefs ?? {})) set[`notifPrefs.${k}`] = v;
  if (dailyTarget === null) unset.dailyTargetOverride = '';
  else if (dailyTarget !== undefined) set.dailyTargetOverride = dailyTarget;
  const u = await User.findByIdAndUpdate(req.userId, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { returnDocument: 'after' });
  if (!u) throw new HttpError(401, 'Sign in again');
  res.json(toMe(u));
});

export const stepsRouter = Router();
stepsRouter.use(requireUser);

stepsRouter.post('/ingest', async (req, res) => {
  await limit(`ingest:${req.userId}`, 120, 3600);
  res.json(await ingest(req.userId!, IngestBody.parse(req.body)));
});

stepsRouter.get('/today', async (req, res) => {
  const userId = new Types.ObjectId(req.userId);
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const [week, user] = await Promise.all([dailyTotals(userId, today - 6 * DAY_MS, today + DAY_MS), User.findById(userId, { baselineDaily: 1 }).lean()]);
  res.json({ steps: week.at(-1)?.steps ?? 0, baselineDaily: user?.baselineDaily ?? 0, week });
});

stepsRouter.get('/analytics', async (req, res) => {
  const userId = new Types.ObjectId(req.userId);
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const from = today - 29 * DAY_MS;
  const [days, user, hourRows, parts, wins] = await Promise.all([
    dailyTotals(userId, from, today + DAY_MS),
    User.findById(userId, { baselineDaily: 1, dailyTargetOverride: 1 }).lean(),
    HourBucket.aggregate<{ _id: number; total: number }>([
      { $match: { userId, hour: { $gte: new Date(from), $lt: new Date(today + DAY_MS) } } },
      { $group: { _id: { $hour: '$hour' }, total: { $sum: '$counted' } } },
    ]),
    Participant.find({ userId }, { status: 1, challengeId: 1 }).lean(),
    Ledger.aggregate<{ total: number }>([{ $match: { account: `user:${req.userId}`, kind: 'payout' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  const baselineDaily = user?.baselineDaily ?? 0;
  const target = user ? targetFor(user) : 0;
  // Average over the days that have any data, so a new user's empty history doesn't flatten the curve.
  const activeDays = days.filter((d) => d.steps > 0).length;
  const hourly = Array.from({ length: 24 }, (_, h) => Math.round((hourRows.find((r) => r._id === h)?.total ?? 0) / Math.max(1, activeDays)));
  const complete = days.slice(0, -1); // today isn't over
  let streak = 0;
  for (let i = complete.length - 1; i >= 0 && complete[i].steps >= target; i--) streak++;
  let longestStreak = 0;
  let run = 0;
  for (const d of complete) {
    run = d.steps >= target ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }
  const best = days.reduce<(typeof days)[number] | null>((b, d) => (d.steps > (b?.steps ?? 0) ? d : b), null);
  const live = await Challenge.countDocuments({ _id: { $in: parts.map((p) => p.challengeId) }, status: 'live' });
  const body: Analytics = {
    days,
    hourly,
    dailyTarget: target,
    baselineDaily,
    thisWeek: days.slice(-7).reduce((a, d) => a + d.steps, 0),
    lastWeek: days.slice(-14, -7).reduce((a, d) => a + d.steps, 0),
    bestDay: best,
    activeDays,
    streak,
    longestStreak,
    challenges: {
      joined: parts.length,
      finished: parts.filter((p) => p.status === 'finished').length,
      live,
      creditsWon: wins[0]?.total ?? 0,
      prizesWon: await Payout.countDocuments({ userId, kind: 'sponsor_prize' }),
    },
  };
  res.json(body);
});

export const notificationsRouter = Router();
notificationsRouter.use(requireUser);

notificationsRouter.get('/', async (req, res) => {
  const [rows, unread] = await Promise.all([
    Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ userId: req.userId, readAt: { $exists: false } }),
  ]);
  const items = rows.map(
    (n): InboxItem => ({
      id: String(n._id),
      kind: n.kind as NotificationKind,
      title: n.title,
      body: n.body,
      challengeId: (n.data as unknown as Record<string, string> | undefined)?.challengeId,
      read: !!n.readAt,
      at: (n.createdAt as Date).toISOString(),
    }),
  );
  res.json({ items, unread });
});

/** Marks the given ids read, or everything when no ids are sent. */
notificationsRouter.post('/read', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(100).optional() }).parse(req.body ?? {});
  await Notification.updateMany({ userId: req.userId, readAt: { $exists: false }, ...(ids ? { _id: { $in: ids } } : {}) }, { $set: { readAt: new Date() } });
  res.json({ unread: await Notification.countDocuments({ userId: req.userId, readAt: { $exists: false } }) });
});

export const walletRouter = Router();
walletRouter.use(requireUser);

walletRouter.get('/', async (req, res) => {
  const acct = account.user(req.userId!);
  const [user, lines, payouts] = await Promise.all([
    User.findById(req.userId, { credits: 1 }).lean(),
    Ledger.find({ account: acct }).sort({ createdAt: -1 }).limit(100).lean(),
    Payout.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  const challengeIds = [...new Set([...lines, ...payouts].map((l) => l.challengeId && String(l.challengeId)).filter(Boolean))];
  const names = new Map((await Challenge.find({ _id: { $in: challengeIds } }, { name: 1 }).lean()).map((c) => [String(c._id), c.name]));
  res.json({
    balance: user?.credits ?? 0,
    lines: lines.map(
      (l): LedgerLine => ({
        id: String(l._id),
        amount: l.amount,
        kind: l.kind as LedgerLine['kind'],
        note: l.note ?? undefined,
        challengeName: l.challengeId ? names.get(String(l.challengeId)) : undefined,
        at: (l.createdAt as Date).toISOString(),
      }),
    ),
    payouts: payouts.map(
      (p): PayoutView => ({
        id: String(p._id),
        challengeId: String(p.challengeId),
        challengeName: names.get(String(p.challengeId)) ?? '',
        kind: p.kind as PayoutView['kind'],
        amount: p.amount ?? undefined,
        prizeDescription: p.prizeDescription ?? undefined,
        status: p.status as PayoutView['status'],
      }),
    ),
  });
});

export const payoutsRouter = Router();
payoutsRouter.use(requireUser);

payoutsRouter.post('/:id/claim', async (req, res) => {
  const body = z.object({ momoNumber: z.string().regex(/^\+233\d{9}$/), network: z.enum(['mtn', 'telecel', 'airteltigo']) }).parse(req.body);
  const p = await Payout.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId, status: 'pending', kind: 'sponsor_prize' },
    { $set: { status: 'claimed', claim: { ...body, at: new Date() } } },
    { returnDocument: 'after' },
  );
  if (!p) throw new HttpError(404, 'Nothing to claim');
  await User.updateOne({ _id: req.userId }, { $set: { phone: body.momoNumber } });
  res.json({ id: String(p._id), challengeId: String(p.challengeId), challengeName: '', kind: p.kind, amount: p.amount, prizeDescription: p.prizeDescription, status: p.status });
});
