// Badges and all-time personal records: small moments that make walking more feel like progress.
import type { Types } from 'mongoose';

import { DAY_MS, type Records } from '../../shared/contracts.js';
import { badgeById, type BadgeId } from '../../shared/engage.js';

import { HourBucket, User } from './models.js';
import { notify } from './push.js';

type Id = Types.ObjectId | string;
const dayStart = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;
/** Monday 00:00 UTC of the week containing `t`. */
export const weekStart = (t: number) => {
  const d = dayStart(t);
  return d - ((new Date(d).getUTCDay() + 6) % 7) * DAY_MS;
};

/** Records only count as "beaten" once there is a real one to beat. */
const MIN_RECORD_DAY = 3000;
const DAY_RECORD_AFTER_MS = 3 * DAY_MS;
const WEEK_RECORD_AFTER_MS = 14 * DAY_MS;

/** Most badges are earned at a moment that already sends a push (target hit, results, a record), so they land in the inbox only. */
const PUSHED: ReadonlySet<BadgeId> = new Set(['day_10k', 'day_20k']);

/** Awards each badge at most once (the conditional update decides), and tells the user about new ones. */
export async function awardBadges(userId: Id, ids: BadgeId[], have?: Iterable<string>) {
  const held = new Set(have ?? []);
  for (const id of ids) {
    if (held.has(id)) continue;
    const res = await User.updateOne({ _id: userId, 'badges.id': { $ne: id } }, { $push: { badges: { id, at: new Date() } } });
    if (!res.modifiedCount) continue;
    const b = badgeById(id)!;
    notify(userId, 'goal', { title: `Badge earned: ${b.title}`, body: b.body, data: { screen: 'analytics' }, dedupe: `badge:${id}`, inboxOnly: !PUSHED.has(id) });
  }
}

/** Streak badges, and the longest streak on record. Called when today's target is first hit. */
export async function noteStreak(userId: Id, streak: number) {
  await User.updateOne({ _id: userId, $or: [{ 'records.longestStreak': { $lt: streak } }, { 'records.longestStreak': { $exists: false } }] }, { $set: { 'records.longestStreak': streak } });
  const ids: BadgeId[] = ['first_target'];
  if (streak >= 3) ids.push('streak_3');
  if (streak >= 7) ids.push('streak_7');
  if (streak >= 30) ids.push('streak_30');
  const u = await User.findById(userId, { badges: 1 }).lean();
  await awardBadges(userId, ids, u?.badges?.map((b) => b.id ?? ''));
}

/** Best day and best full week from everything before today (and before this week). */
async function historyBests(userId: Types.ObjectId, today: number) {
  const rows = await HourBucket.aggregate<{ _id: Date; steps: number }>([
    { $match: { userId, hour: { $lt: new Date(today) } } },
    { $group: { _id: { $dateTrunc: { date: '$hour', unit: 'day' } }, steps: { $sum: '$counted' } } },
  ]);
  let bestDay = { t: 0, steps: 0 };
  const weeks = new Map<number, number>();
  for (const r of rows) {
    const t = r._id.getTime();
    if (r.steps > bestDay.steps) bestDay = { t, steps: r.steps };
    weeks.set(weekStart(t), (weeks.get(weekStart(t)) ?? 0) + r.steps);
  }
  let bestWeek = { t: 0, steps: 0 };
  for (const [t, steps] of weeks) if (t < weekStart(today) && steps > bestWeek.steps) bestWeek = { t, steps };
  return { bestDay, bestWeek };
}

/**
 * Keeps the all-time records current after a sync, and celebrates the moment one falls: once per day
 * for a best day, once per week for a best week. The first call only backfills from history.
 */
export async function checkRecords(userId: Types.ObjectId, now: number, todaySteps: number, weekSteps: () => Promise<number>) {
  const user = await User.findById(userId, { records: 1, badges: 1, createdAt: 1 }).lean<{ records?: { bestDaySteps?: number; bestDay?: Date; bestWeekSteps?: number; bestWeek?: Date }; badges?: { id?: string }[]; createdAt?: Date }>();
  if (!user) return;
  const today = dayStart(now);
  const week = weekStart(now);
  const age = now - (user.createdAt?.getTime() ?? now);
  let rec = user.records;
  if (rec?.bestDaySteps == null) {
    const h = await historyBests(userId, today);
    rec = { bestDaySteps: h.bestDay.steps, bestDay: h.bestDay.steps ? new Date(h.bestDay.t) : undefined, bestWeekSteps: h.bestWeek.steps, bestWeek: h.bestWeek.steps ? new Date(h.bestWeek.t) : undefined };
    await User.updateOne({ _id: userId }, { $set: { 'records.bestDaySteps': rec.bestDaySteps, 'records.bestDay': rec.bestDay, 'records.bestWeekSteps': rec.bestWeekSteps, 'records.bestWeek': rec.bestWeek } });
  }
  const held = user.badges?.map((b) => b.id ?? '') ?? [];
  const dayKey = new Date(today).toISOString().slice(0, 10);
  const badges: BadgeId[] = [];
  if (todaySteps >= 10_000) badges.push('day_10k');
  if (todaySteps >= 20_000) badges.push('day_20k');

  const prevDay = rec.bestDaySteps ?? 0;
  if (todaySteps > prevDay) {
    // The first time today passes the old record is the moment; after that today is only beating itself.
    const firstToday = rec.bestDay?.getTime() !== today;
    await User.updateOne({ _id: userId }, { $set: { 'records.bestDaySteps': todaySteps, 'records.bestDay': new Date(today) } });
    if (firstToday && prevDay >= MIN_RECORD_DAY && age >= DAY_RECORD_AFTER_MS) {
      badges.push('record_breaker');
      notify(userId, 'goal', { title: 'New best day', body: `You just passed your record of ${prevDay.toLocaleString('en-GB')} steps. Keep going.`, data: { screen: 'analytics' }, dedupe: `record:day:${dayKey}` });
    }
  }

  const prevWeek = rec.bestWeekSteps ?? 0;
  const thisWeek = await weekSteps();
  if (thisWeek > prevWeek) {
    const firstThisWeek = rec.bestWeek?.getTime() !== week;
    await User.updateOne({ _id: userId }, { $set: { 'records.bestWeekSteps': thisWeek, 'records.bestWeek': new Date(week) } });
    if (firstThisWeek && prevWeek >= MIN_RECORD_DAY * 3 && age >= WEEK_RECORD_AFTER_MS) {
      notify(userId, 'goal', { title: 'Your best week yet', body: `This week just passed your record of ${prevWeek.toLocaleString('en-GB')} steps.`, data: { screen: 'analytics' }, dedupe: `record:week:${new Date(week).toISOString().slice(0, 10)}` });
    }
  }
  await awardBadges(userId, badges, held);
}

export function toRecords(u: { records?: { bestDaySteps?: number | null; bestDay?: Date | null; bestWeekSteps?: number | null; bestWeek?: Date | null; longestStreak?: number | null } | null }): Records | undefined {
  const r = u.records;
  if (!r || (r.bestDaySteps == null && r.longestStreak == null)) return undefined;
  return {
    bestDay: r.bestDaySteps && r.bestDay ? { day: r.bestDay.toISOString(), steps: r.bestDaySteps } : null,
    bestWeek: r.bestWeekSteps && r.bestWeek ? { week: r.bestWeek.toISOString(), steps: r.bestWeekSteps } : null,
    longestStreak: r.longestStreak ?? 0,
  };
}
