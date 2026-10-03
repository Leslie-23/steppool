import { randomBytes } from 'node:crypto';

import type { Types } from 'mongoose';

import { DAY_MS, INVITE_CODE_ALPHABET } from '../../shared/contracts.js';
import { CREDITS, dailyTarget } from '../../shared/goals.js';

import { account, inTransaction, transfer } from './ledger.js';
import { Ledger, User, type UserDoc } from './models.js';
import { notify } from './push.js';

const dayKey = (t: number) => new Date(Math.floor(t / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
/** ISO week id like 2026-W40, used to make the Monday top-up idempotent. */
function weekKey(t: number) {
  const d = new Date(Math.floor(t / DAY_MS) * DAY_MS);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week decides the ISO year
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / DAY_MS - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The daily target in effect for a user: their own if set, otherwise usual pace +15%. */
export function targetFor(u: Pick<UserDoc, 'dailyTargetOverride' | 'baselineDaily'>) {
  return u.dailyTargetOverride ?? dailyTarget(u.baselineDaily ?? 0);
}

/**
 * Credits a user from the mint exactly once per `ref`. A duplicate ref (re-sync, retried job)
 * hits the unique index, aborts the transaction, and returns false: no double pay, ever.
 */
export async function award(userId: Types.ObjectId | string, amount: number, kind: 'walk_reward' | 'streak_bonus' | 'weekly_topup' | 'referral', ref: string, note?: string) {
  // Cheap pre-check so a sync that already paid today doesn't open a transaction just to abort it.
  if (await Ledger.exists({ ref })) return false;
  try {
    await inTransaction((session) => transfer(session, { from: account.mint, to: account.user(userId), amount, kind, ref, note }));
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false;
    throw e;
  }
}

/** Called after each sync: +20 for hitting today's target, +100 on every 7th consecutive day. */
export async function rewardDailyTarget(userId: Types.ObjectId, todaySteps: number, now: number) {
  const user = await User.findById(userId, { dailyTargetOverride: 1, baselineDaily: 1 }).lean();
  if (!user || todaySteps < targetFor(user)) return;
  const today = dayKey(now);
  if (!(await award(userId, CREDITS.dailyTargetHit, 'walk_reward', `walk:${userId}:${today}`, 'Daily target hit'))) return;

  // Streak = consecutive days (ending today) with a walk reward.
  const since = dayKey(now - 60 * DAY_MS);
  const refs = new Set(
    (await Ledger.find({ account: account.user(userId), kind: 'walk_reward', ref: { $gte: `walk:${userId}:${since}` } }, { ref: 1 }).lean()).map((l) => l.ref),
  );
  let streak = 0;
  for (let t = now; refs.has(`walk:${userId}:${dayKey(t)}`); t -= DAY_MS) streak++;
  const bonus = streak > 0 && streak % CREDITS.streakEvery === 0;
  if (bonus) await award(userId, CREDITS.streakBonus, 'streak_bonus', `streak:${userId}:${today}`, `${streak}-day streak`);
  notify(userId, 'goal', {
    title: bonus ? `${streak}-day streak 🔥 +${CREDITS.dailyTargetHit + CREDITS.streakBonus} credits` : `Target hit · +${CREDITS.dailyTargetHit} credits`,
    body: bonus ? 'Seven days straight. Keep it going.' : 'Daily target done. Come back tomorrow for more.',
  });
}

/** Monday job: anyone below the floor is topped back up to it. */
export async function weeklyTopup(now = Date.now()) {
  const week = weekKey(now);
  let count = 0;
  for await (const u of User.find({ credits: { $lt: CREDITS.weeklyFloor }, name: { $ne: '' } }, { credits: 1 }).lean().cursor()) {
    const amount = CREDITS.weeklyFloor - (u.credits ?? 0);
    if (amount > 0 && (await award(u._id, amount, 'weekly_topup', `topup:${u._id}:${week}`, 'Weekly top-up'))) {
      count++;
      notify(u._id, 'announcement', { title: `+${amount} credits`, body: `Your weekly top-up is in. You're back to ${CREDITS.weeklyFloor}.` });
    }
  }
  return count;
}

const REFERRAL_WINDOW_MS = 7 * DAY_MS;
export const canRedeemReferral = (u: Pick<UserDoc, 'referredBy'> & { createdAt?: Date }) =>
  !u.referredBy && !!u.createdAt && Date.now() - new Date(u.createdAt).getTime() < REFERRAL_WINDOW_MS;

/** A short shareable code per user, from the same no-look-alikes alphabet as invite codes. */
export async function ensureReferralCode(u: UserDoc) {
  if (u.referralCode) return u.referralCode;
  for (let i = 0; i < 6; i++) {
    const bytes = randomBytes(6);
    const code = Array.from(bytes, (b) => INVITE_CODE_ALPHABET[b % INVITE_CODE_ALPHABET.length]).join('');
    const res = await User.updateOne({ _id: u._id, referralCode: { $exists: false } }, { $set: { referralCode: code } }).catch((e) => {
      if ((e as { code?: number }).code === 11000) return null;
      throw e;
    });
    if (res?.modifiedCount) return code;
    const fresh = await User.findById(u._id, { referralCode: 1 }).lean();
    if (fresh?.referralCode) return fresh.referralCode;
  }
  throw new Error('Could not allocate a referral code');
}
