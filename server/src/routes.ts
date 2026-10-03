import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

import { DAY_MS, IngestBody, type LedgerLine, type Payout as PayoutView } from '../../shared/contracts.js';

import { limit, requireUser } from './auth.js';
import { HttpError } from './errors.js';
import { account } from './ledger.js';
import { Challenge, Ledger, Payout, User } from './models.js';
import { dailyTotals, ingest } from './steps.js';
import { toMe } from './views.js';

export const meRouter = Router();
meRouter.use(requireUser);

meRouter.get('/', async (req, res) => {
  const u = await User.findById(req.userId);
  if (!u) throw new HttpError(401, 'Sign in again');
  res.json(toMe(u));
});

meRouter.patch('/', async (req, res) => {
  const patch = z
    .object({
      name: z.string().trim().min(2).max(24).optional(),
      avatar: z.string().url().max(500).optional(),
      pushToken: z.string().max(200).optional(),
    })
    .parse(req.body);
  const u = await User.findByIdAndUpdate(req.userId, { $set: patch }, { returnDocument: 'after' });
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
