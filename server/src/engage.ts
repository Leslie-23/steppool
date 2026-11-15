// Scheduled reasons to open the app: the Monday recap and the evening "almost there" nudge.
import type { Types } from 'mongoose';

import { DAY_MS } from '../../shared/contracts.js';
import { NUDGE, WEEKLY_WALK } from '../../shared/engage.js';
import { CREDITS } from '../../shared/goals.js';

import { weekStart } from './achievements.js';
import { weeklyWindow } from './challenges.js';
import { Challenge, HourBucket, User } from './models.js';
import { notify } from './push.js';
import { dayKey, targetFor, weekKey } from './rewards.js';

const n = (v: number) => v.toLocaleString('en-GB');

/**
 * Monday morning: each walker's last week (Mon–Sun) against the week before, days on target and best day,
 * with this week's Weekly Walk to tap into. Once per user per week, however many servers run the job.
 */
export async function weeklyRecap(now = Date.now()) {
  const thisWeek = weekStart(now);
  const lastWeek = thisWeek - 7 * DAY_MS;
  const rows = await HourBucket.aggregate<{ _id: { u: Types.ObjectId; d: Date }; steps: number }>([
    { $match: { hour: { $gte: new Date(lastWeek - 7 * DAY_MS), $lt: new Date(thisWeek) } } },
    { $group: { _id: { u: '$userId', d: { $dateTrunc: { date: '$hour', unit: 'day' } } }, steps: { $sum: '$counted' } } },
  ]);
  const byUser = new Map<string, { days: Map<number, number>; before: number }>();
  for (const r of rows) {
    const u = byUser.get(String(r._id.u)) ?? { days: new Map<number, number>(), before: 0 };
    const t = r._id.d.getTime();
    if (t >= lastWeek) u.days.set(t, r.steps);
    else u.before += r.steps;
    byUser.set(String(r._id.u), u);
  }
  const weekly = await Challenge.findOne({ houseWeek: weekKey(weeklyWindow(now).start), status: { $in: ['upcoming', 'live'] } }, { _id: 1 }).lean();
  const users = await User.find({ _id: { $in: [...byUser.keys()] }, name: { $ne: '' } }, { dailyTargetOverride: 1, baselineDaily: 1 }).lean();
  let sent = 0;
  for (const u of users) {
    const w = byUser.get(String(u._id))!;
    const total = [...w.days.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    const target = targetFor(u);
    const onTarget = [...w.days.values()].filter((s) => s >= target).length;
    const [bestT, bestSteps] = [...w.days.entries()].reduce((b, e) => (e[1] > b[1] ? e : b));
    const parts: string[] = [];
    if (w.before > 0) {
      const pct = Math.round(((total - w.before) / w.before) * 100);
      parts.push(pct === 0 ? 'Level with the week before' : `${pct > 0 ? 'Up' : 'Down'} ${Math.abs(pct)}% on the week before`);
    }
    parts.push(`${onTarget} of 7 days on target`);
    parts.push(`best day ${new Date(bestT).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} (${n(bestSteps)})`);
    const body = `${parts.join(' · ')}.${weekly ? ` This week's ${WEEKLY_WALK.name} is open: ${n(WEEKLY_WALK.prizeCredits)} credits to share.` : ''}`;
    notify(u._id, 'announcement', {
      title: `Your week: ${n(total)} steps`,
      body,
      data: weekly ? { challengeId: String(weekly._id), screen: 'analytics' } : { screen: 'analytics' },
      dedupe: `recap:${weekKey(lastWeek)}`,
    });
    sent++;
  }
  return sent;
}

/**
 * Evening: one push, at most once a day, to people who have synced today and are within reach of their
 * target. Skipped entirely for anyone with reminders off, so it never becomes inbox noise.
 */
export async function eveningNudge(now = Date.now()) {
  const hour = new Date(now).getUTCHours();
  if (hour < NUDGE.fromHour || hour > NUDGE.toHour) return 0;
  const day = Math.floor(now / DAY_MS) * DAY_MS;
  const rows = await HourBucket.aggregate<{ _id: Types.ObjectId; steps: number }>([
    { $match: { hour: { $gte: new Date(day), $lt: new Date(day + DAY_MS) } } },
    { $group: { _id: '$userId', steps: { $sum: '$counted' } } },
    { $match: { steps: { $gt: 0 } } },
  ]);
  const steps = new Map(rows.map((r) => [String(r._id), r.steps]));
  const users = await User.find({ _id: { $in: rows.map((r) => r._id) }, name: { $ne: '' }, pushToken: { $type: 'string' }, 'notifPrefs.reminder': { $ne: false } }, { dailyTargetOverride: 1, baselineDaily: 1 }).lean();
  let sent = 0;
  for (const u of users) {
    const left = targetFor(u) - (steps.get(String(u._id)) ?? 0);
    if (left <= 0 || left > NUDGE.maxStepsLeft) continue;
    const minutes = Math.max(5, Math.round(left / 100 / 5) * 5);
    notify(u._id, 'reminder', { title: `${n(left)} steps to today's target`, body: `About a ${minutes}-minute walk. Finish it for +${CREDITS.dailyTargetHit} credits.`, dedupe: `nudge:${dayKey(now)}` });
    sent++;
  }
  return sent;
}
