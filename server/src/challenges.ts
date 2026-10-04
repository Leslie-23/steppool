import { randomInt } from 'node:crypto';

import { Router } from 'express';
import { Types } from 'mongoose';

import { CreateCashChallengeBody, CreateChallengeBody, INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, SponsorChallengeBody, type ChallengeResults } from '../../shared/contracts.js';
import { challengeGoal, DEFAULT_MULTIPLIER } from '../../shared/goals.js';

import { requireAdmin, requireUser } from './auth.js';
import { cashEnabledFor } from './config.js';
import { HttpError } from './errors.js';
import { account, balanceOf, cash, inTransaction, transfer } from './ledger.js';
import { Challenge, Ledger, Participant, Payout, User, type ChallengeDoc, type ParticipantDoc } from './models.js';
import { scheduleChallenge } from './queue.js';
import { notify } from './push.js';
import { markDirty, rankOf, setScore, topRows } from './realtime.js';
import { sumBuckets } from './steps.js';
import { toSummary } from './views.js';

const HOUR = 3_600_000;
const SYNC_GRACE_MS = 2 * HOUR;

const newCode = () => Array.from({ length: INVITE_CODE_LENGTH }, () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]).join('');
const ceilHour = (t: number) => Math.ceil(t / HOUR) * HOUR;

/** Late joiners are allowed for the first quarter of a challenge (max 24h). */
export function joinDeadline(c: Pick<ChallengeDoc, 'startsAt' | 'endsAt'>) {
  const dur = c.endsAt.getTime() - c.startsAt.getTime();
  return new Date(c.startsAt.getTime() + Math.min(24 * HOUR, dur / 4));
}

async function pools(cs: Pick<ChallengeDoc, '_id' | 'kind'>[]) {
  const poolOf = (c: Pick<ChallengeDoc, '_id' | 'kind'>) => (c.kind === 'cash' ? cash.pool(c._id) : account.pool(c._id));
  const rows = await Ledger.aggregate<{ _id: string; total: number }>([
    { $match: { account: { $in: cs.map(poolOf) } } },
    { $group: { _id: '$account', total: { $sum: '$amount' } } },
  ]);
  return new Map(rows.map((r) => [r._id.slice(r._id.lastIndexOf(':') + 1), r.total]));
}

async function summarise(cs: ChallengeDoc[], userId: string) {
  const ids = cs.map((c) => c._id);
  const [poolMap, mine] = await Promise.all([pools(cs), Participant.find({ userId, challengeId: { $in: ids } }).lean<ParticipantDoc[]>()]);
  return Promise.all(
    cs.map(async (c) => {
      const p = mine.find((m) => m.challengeId.equals(c._id));
      // Settled challenges have an empty pool account; show what was paid out instead.
      const pool =
        c.status !== 'settled'
          ? (poolMap.get(String(c._id)) ?? 0)
          : c.kind === 'cash'
            ? c.players * (c.entryPesewas ?? 0)
            : (c.perFinisher ?? 0) * (c.finishers ?? 0);
      return toSummary(c, pool, p ? { p, rank: await rankOf(String(c._id), p.steps ?? 0) } : undefined);
    }),
  );
}

async function createChallenge(input: Omit<CreateChallengeBody, 'entryCredits'> & { entryCredits?: number; entryPesewas?: number; kind: 'credits' | 'sponsored' | 'cash'; sponsor?: ChallengeDoc['sponsor']; goalMultiplier?: number; createdBy?: Types.ObjectId }) {
  const now = Date.now();
  const startsAt = input.startsAt ? ceilHour(new Date(input.startsAt).getTime()) : ceilHour(now + 60_000);
  if (startsAt < now || startsAt > now + 14 * 24 * HOUR) throw new HttpError(400, 'Start must be within the next 14 days');
  const endsAt = startsAt + input.durationHours * HOUR;
  for (let attempt = 0; ; attempt++) {
    try {
      const c = await Challenge.create({
        name: input.name,
        kind: input.kind,
        visibility: input.visibility,
        entryCredits: input.kind === 'credits' ? (input.entryCredits ?? 0) : 0,
        entryPesewas: input.kind === 'cash' ? input.entryPesewas : 0,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        syncCutoffAt: new Date(endsAt + SYNC_GRACE_MS),
        goalMultiplier: input.goalMultiplier ?? DEFAULT_MULTIPLIER,
        inviteCode: newCode(),
        sponsor: input.sponsor,
        createdBy: input.createdBy,
      });
      await scheduleChallenge(c);
      return c as unknown as ChallengeDoc;
    } catch (e) {
      if ((e as { code?: number }).code === 11000 && attempt < 5) continue; // invite code collision
      throw e;
    }
  }
}

export async function joinChallenge(challengeId: string, userId: string) {
  const c = await Challenge.findById(challengeId);
  if (!c) throw new HttpError(404, 'Challenge not found');
  if (!['upcoming', 'live'].includes(c.status) || Date.now() > joinDeadline(c).getTime()) throw new HttpError(409, 'This challenge is closed to new players');
  const user = await User.findById(userId);
  if (!user?.name) throw new HttpError(400, 'Finish your profile first');
  if (c.kind === 'cash' && !cashEnabledFor(user.email)) throw new HttpError(403, 'Cash challenges are not available yet');

  const durationH = (c.endsAt.getTime() - c.startsAt.getTime()) / HOUR;
  const goal = challengeGoal(user.baselineDaily ?? 0, durationH, c.goalMultiplier ?? DEFAULT_MULTIPLIER);

  try {
    await inTransaction(async (session) => {
      await Participant.create([{ challengeId: c._id, userId: user._id, name: user.name, goal }], { session });
      if (c.kind === 'cash') {
        await transfer(session, { from: cash.user(user._id), to: cash.pool(c._id), amount: c.entryPesewas, kind: 'entry', challengeId: c._id });
      } else if (c.entryCredits > 0) {
        await transfer(session, { from: account.user(user._id), to: account.pool(c._id), amount: c.entryCredits, kind: 'entry', challengeId: c._id });
      }
      await Challenge.updateOne({ _id: c._id }, { $inc: { players: 1 } }, { session });
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new HttpError(409, "You're already in");
    throw e;
  }

  // Joining mid-challenge: count what they've already walked inside the window.
  let steps = 0;
  if (c.status === 'live') {
    steps = (await sumBuckets(user._id, c.startsAt, c.endsAt)).counted;
    await Participant.updateOne({ challengeId: c._id, userId: user._id }, { $set: { steps, ...(steps >= goal ? { goalHitAt: new Date() } : {}) } });
  }
  await setScore(String(c._id), String(user._id), steps);
  markDirty(String(c._id));
  if (c.createdBy && !c.createdBy.equals(user._id)) {
    notify(c.createdBy, 'joins', { title: `${user.name.split(' ')[0]} joined ${c.name}`, body: `${c.players + 1} walking now. Pool keeps growing.`, data: { challengeId: String(c._id) } }, `joins:${c._id}`);
  }
  const fresh = (await Challenge.findById(c._id).lean<ChallengeDoc>())!;
  return (await summarise([fresh], userId))[0];
}

export const challengesRouter = Router();
challengesRouter.use(requireUser);

challengesRouter.get('/', async (req, res) => {
  const userId = req.userId!;
  const myIds = (await Participant.find({ userId }, { challengeId: 1 }).sort({ createdAt: -1 }).limit(30).lean()).map((p) => p.challengeId);
  const active = { status: { $in: ['upcoming', 'live'] as ('upcoming' | 'live')[] } };
  const user = await User.findById(userId, { email: 1 }).lean();
  const kinds: ('credits' | 'cash')[] = user && cashEnabledFor(user.email) ? ['credits', 'cash'] : ['credits'];
  const [featured, open, mine] = await Promise.all([
    Challenge.find({ kind: 'sponsored', visibility: 'public', ...active }).sort({ startsAt: 1 }).limit(5).lean<ChallengeDoc[]>(),
    Challenge.find({ kind: { $in: kinds }, visibility: 'public', _id: { $nin: myIds }, ...active }).sort({ players: -1, startsAt: 1 }).limit(20).lean<ChallengeDoc[]>(),
    Challenge.find({ _id: { $in: myIds } }).sort({ endsAt: -1 }).lean<ChallengeDoc[]>(),
  ]);
  const joinable = (c: ChallengeDoc) => Date.now() <= joinDeadline(c).getTime();
  res.json({
    featured: await summarise(featured, userId),
    open: await summarise(open.filter(joinable), userId),
    mine: await summarise(mine, userId),
  });
});

challengesRouter.get('/code/:code', async (req, res) => {
  const c = await Challenge.findOne({ inviteCode: String(req.params.code).toUpperCase() }).lean<ChallengeDoc>();
  if (!c) throw new HttpError(404, 'No challenge with that code');
  res.json((await summarise([c], req.userId!))[0]);
});

const byId = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'Challenge not found');
  const c = await Challenge.findById(id).lean<ChallengeDoc>();
  if (!c) throw new HttpError(404, 'Challenge not found');
  return c;
};

challengesRouter.get('/:id', async (req, res) => {
  res.json((await summarise([await byId(req.params.id)], req.userId!))[0]);
});

challengesRouter.get('/:id/leaderboard', async (req, res) => {
  const c = await byId(req.params.id);
  res.json(await topRows(c._id));
});

challengesRouter.get('/:id/results', async (req, res) => {
  const c = await byId(req.params.id);
  if (c.status !== 'settled') throw new HttpError(409, 'Results are not ready yet');
  const [summary] = await summarise([c], req.userId!);
  const top = await topRows(c._id);
  const p = await Participant.findOne({ challengeId: c._id, userId: req.userId }).lean<ParticipantDoc>();
  const payout = p ? await Payout.findOne({ challengeId: c._id, userId: req.userId, kind: 'sponsor_prize' }).lean() : null;
  const body: ChallengeResults = {
    challenge: summary,
    finishers: c.finishers ?? 0,
    perFinisher: c.kind !== 'sponsored' ? c.perFinisher ?? 0 : undefined,
    perMisser: c.kind === 'cash' ? c.perMisser ?? undefined : undefined,
    top: top.slice(0, 10),
    me: p
      ? {
          steps: p.steps ?? 0,
          goal: p.goal,
          rank: await rankOf(String(c._id), p.steps ?? 0),
          goalHit: p.status === 'finished',
          wonCredits: p.wonCredits ?? undefined,
          wonPesewas: p.wonPesewas ?? undefined,
          prize: payout?.prizeDescription ?? undefined,
          payoutId: payout ? String(payout._id) : undefined,
          flagged: (p.heldSteps ?? 0) > 0,
        }
      : undefined,
  };
  res.json(body);
});

challengesRouter.post('/', async (req, res) => {
  const body = CreateChallengeBody.parse(req.body);
  const creator = await User.findById(req.userId);
  if ((creator?.credits ?? 0) < body.entryCredits) throw new HttpError(409, 'Not enough credits to enter your own challenge');
  const c = await createChallenge({ ...body, kind: 'credits', createdBy: creator!._id });
  res.status(201).json(await joinChallenge(String(c._id), req.userId!));
});

/** Creates a cash challenge. The creator joins (and pays) through /cash/challenges/:id/join, like everyone else. */
challengesRouter.post('/cash', async (req, res) => {
  const body = CreateCashChallengeBody.parse(req.body);
  const creator = await User.findById(req.userId, { email: 1 }).lean();
  if (!creator || !cashEnabledFor(creator.email)) throw new HttpError(403, 'Cash challenges are not available yet');
  const c = await createChallenge({ ...body, kind: 'cash', createdBy: creator._id });
  res.status(201).json(toSummary(c, 0));
});

challengesRouter.post('/:id/join', async (req, res) => {
  res.json(await joinChallenge(req.params.id, req.userId!));
});

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.post('/challenges', async (req, res) => {
  const body = SponsorChallengeBody.parse(req.body);
  const c = await createChallenge({ ...body, kind: 'sponsored', visibility: 'public' });
  res.status(201).json(toSummary(c, 0));
});

/** Participants with held (unverified) steps, for manual review before or after settlement. */
adminRouter.get('/challenges/:id/flags', async (req, res) => {
  res.json(await Participant.find({ challengeId: req.params.id, heldSteps: { $gt: 0 } }).sort({ heldSteps: -1 }).lean());
});

adminRouter.get('/payouts', async (req, res) => {
  const rows = await Payout.find({ status: String(req.query.status ?? 'claimed') as 'pending' | 'claimed' | 'fulfilled' }).sort({ updatedAt: 1 }).limit(200).lean();
  const [users, challenges] = await Promise.all([
    User.find({ _id: { $in: rows.map((r) => r.userId) } }, { name: 1, email: 1 }).lean(),
    Challenge.find({ _id: { $in: rows.map((r) => r.challengeId) } }, { name: 1 }).lean(),
  ]);
  const u = new Map(users.map((x) => [String(x._id), x]));
  const c = new Map(challenges.map((x) => [String(x._id), x.name]));
  res.json(
    rows.map((r) => ({
      id: String(r._id),
      prizeDescription: r.prizeDescription,
      amount: r.amount,
      status: r.status,
      user: { name: u.get(String(r.userId))?.name ?? '', email: u.get(String(r.userId))?.email ?? '' },
      challengeName: c.get(String(r.challengeId)) ?? '',
      claim: r.claim?.momoNumber ? r.claim : undefined,
    })),
  );
});

adminRouter.post('/payouts/:id/fulfill', async (req, res) => {
  const p = await Payout.findOneAndUpdate({ _id: req.params.id, status: 'claimed' }, { $set: { status: 'fulfilled' } }, { returnDocument: 'after' });
  if (!p) throw new HttpError(404, 'No claimed payout with that id');
  res.json(p);
});

/** Ledger invariant check: every line sums to zero, and user caches match their ledger balance. */
adminRouter.get('/ledger/check', async (_req, res) => {
  const [total] = await Ledger.aggregate<{ sum: number }>([{ $group: { _id: null, sum: { $sum: '$amount' } } }]);
  const mismatched: string[] = [];
  for await (const u of User.find({}, { credits: 1 }).lean().cursor()) {
    if ((await balanceOf(account.user(u._id))) !== (u.credits ?? 0)) mismatched.push(String(u._id));
  }
  res.json({ sum: total?.sum ?? 0, mismatchedUsers: mismatched });
});
