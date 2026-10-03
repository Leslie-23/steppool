import { Types } from 'mongoose';

import { DAY_MS, type IngestBody } from '../../shared/contracts.js';
import { baselineFrom } from '../../shared/goals.js';

import { config } from './config.js';
import { Challenge, HourBucket, Participant, StepSampleModel, User } from './models.js';
import { notify } from './push.js';
import { rewardDailyTarget } from './rewards.js';
import { emit, markDirty, rankOf, setScore } from './realtime.js';
import { HOUR_MS, SUSTAINED_HOURLY, SUSTAINED_RUN_HOURS, applySustainedCheck, buildBuckets, classify, holdLateBackfill, type RawSample } from './verify.js';

/** How far a run of busy hours is followed past the rebuild window (longer runs are not plausible walking anyway). */
const MAX_RUN_LOOKAROUND_H = 48;
const dayStart = (t: number) => Math.floor(t / DAY_MS) * DAY_MS;

/** Verified daily totals (UTC days, Accra is UTC+0) for [from, to). */
export async function dailyTotals(userId: Types.ObjectId, from: number, to: number) {
  const rows = await HourBucket.aggregate<{ _id: Date; steps: number }>([
    { $match: { userId, hour: { $gte: new Date(from), $lt: new Date(to) } } },
    { $group: { _id: { $dateTrunc: { date: '$hour', unit: 'day' } }, steps: { $sum: '$counted' } } },
  ]);
  const byDay = new Map(rows.map((r) => [r._id.getTime(), r.steps]));
  const out: { day: string; steps: number }[] = [];
  for (let d = dayStart(from); d < to; d += DAY_MS) out.push({ day: new Date(d).toISOString(), steps: byDay.get(d) ?? 0 });
  return out;
}

export async function sumBuckets(userId: Types.ObjectId, from: Date, to: Date) {
  const [row] = await HourBucket.aggregate<{ counted: number; held: number }>([
    { $match: { userId, hour: { $gte: from, $lt: to } } },
    { $group: { _id: null, counted: { $sum: '$counted' }, held: { $sum: '$held' } } },
  ]);
  return { counted: row?.counted ?? 0, held: row?.held ?? 0 };
}

/**
 * Grows [from, to) outward over any adjacent run of high-volume hours, so the sustained-cadence
 * check always judges a run whole. Judging a clipped run would release hours it had already held.
 */
async function expandOverRuns(userId: Types.ObjectId, from: number, to: number) {
  const reach = MAX_RUN_LOOKAROUND_H * HOUR_MS;
  const near = await HourBucket.find(
    { userId, $or: [{ hour: { $gte: new Date(from - reach), $lt: new Date(from) } }, { hour: { $gte: new Date(to), $lt: new Date(to + reach) } }] },
    { hour: 1, counted: 1, held: 1 },
  ).lean();
  const busy = new Set(near.filter((b) => (b.counted ?? 0) + (b.held ?? 0) >= SUSTAINED_HOURLY).map((b) => b.hour.getTime()));
  while (busy.has(from - HOUR_MS)) from -= HOUR_MS;
  while (busy.has(to)) to += HOUR_MS;
  return { from, to };
}

/** Rebuilds hourly buckets for [from, to) from every stored sample in that window. */
async function rebuildBuckets(userId: Types.ObjectId, fromIn: number, toIn: number) {
  const { from, to } = await expandOverRuns(userId, fromIn, toIn);
  const samples = await StepSampleModel.find({ userId, start: { $lt: new Date(to) }, end: { $gte: new Date(from) } }).lean<RawSample[]>();
  const hours: number[] = [];
  for (let h = from; h < to; h += HOUR_MS) hours.push(h);
  const buckets = applySustainedCheck([...buildBuckets(samples, hours).values()]);
  // Native driver write: the values are already final, so Mongoose casting adds nothing.
  await HourBucket.collection.bulkWrite(
    buckets.map((b) => ({
      updateOne: {
        filter: { userId, hour: new Date(b.hour) },
        update: { $set: { counted: b.counted, held: b.held, flags: b.flags, bySource: Object.entries(b.bySource).map(([source, count]) => ({ source, count })) } },
        upsert: true,
      },
    })),
  );
}

/** `now` is injectable so simulations can replay uploads at the time a phone would have sent them. */
export async function ingest(userIdStr: string, body: IngestBody, now = new Date()) {
  const userId = new Types.ObjectId(userIdStr);

  // Only brand-new samples are classified and stored; re-uploads (sync overlap) are ignored.
  const existing = new Set(
    (await StepSampleModel.find({ userId, nativeId: { $in: body.samples.map((s) => s.nativeId) } }, { nativeId: 1 }).lean()).map((s) => s.nativeId),
  );
  const fresh = body.samples
    .filter((s) => !existing.has(s.nativeId))
    .map((s) => {
      const raw: RawSample & { nativeId: string; deviceKind?: string } = {
        nativeId: s.nativeId,
        start: new Date(s.start),
        end: new Date(s.end),
        count: s.count,
        source: s.source,
        recordingMethod: s.recordingMethod,
        deviceKind: s.device?.kind,
      };
      raw.rejected = classify(raw, now, config.extraTrustedSources);
      return raw;
    });
  const user = await User.findById(userId, { baselineDaily: 1 }).lean();
  const flagged = holdLateBackfill(fresh, now, user?.baselineDaily ?? 0);

  if (flagged.length) {
    await StepSampleModel.bulkWrite(
      flagged.map((s) => ({
        updateOne: { filter: { userId, nativeId: s.nativeId }, update: { $setOnInsert: { ...s, userId, uploadedAt: now } }, upsert: true },
      })),
      { ordered: false },
    );
    // Rebuild every touched hour, padded so the sustained-cadence check sees whole runs.
    const pad = SUSTAINED_RUN_HOURS * HOUR_MS;
    const from = Math.floor(Math.min(...flagged.map((s) => s.start.getTime())) / HOUR_MS) * HOUR_MS - pad;
    const to = Math.ceil(Math.max(...flagged.map((s) => s.end.getTime())) / HOUR_MS) * HOUR_MS + pad;
    await rebuildBuckets(userId, from, Math.max(to, from + HOUR_MS));
    await refreshBaseline(userId, now.getTime());
    await updateChallenges(userId, new Date(from), new Date(to));
  }

  const today = await sumBuckets(userId, new Date(dayStart(now.getTime())), new Date(dayStart(now.getTime()) + DAY_MS));
  await rewardDailyTarget(userId, today.counted, now.getTime());
  return { accepted: flagged.filter((s) => !s.rejected).length, todaySteps: today.counted };
}

async function refreshBaseline(userId: Types.ObjectId, now: number) {
  const days = await dailyTotals(userId, dayStart(now) - 7 * DAY_MS, dayStart(now));
  const baselineDaily = baselineFrom(days.map((d) => d.steps));
  if (baselineDaily) await User.updateOne({ _id: userId }, { $set: { baselineDaily } });
}

/** Recomputes this user's totals in every live challenge overlapping the changed window. */
async function updateChallenges(userId: Types.ObjectId, from: Date, to: Date) {
  const parts = await Participant.find({ userId, status: 'active' });
  if (!parts.length) return;
  const challenges = await Challenge.find({ _id: { $in: parts.map((p) => p.challengeId) }, status: 'live', startsAt: { $lt: to }, endsAt: { $gt: from } });
  for (const c of challenges) {
    const p = parts.find((x) => x.challengeId.equals(c._id))!;
    const before = p.steps ?? 0;
    const { counted, held } = await sumBuckets(userId, c.startsAt, c.endsAt);
    if (counted === before && held === p.heldSteps) continue;
    const cid = String(c._id);
    p.steps = counted;
    p.heldSteps = held;
    const justHit = !p.goalHitAt && counted >= p.goal;
    if (justHit) p.goalHitAt = new Date();
    await p.save();
    await setScore(cid, String(userId), counted);
    markDirty(cid);
    if (justHit) {
      emit(cid, 'goal:hit', { challengeId: cid, userId: String(userId), name: p.name });
      notify(userId, 'goal', { title: 'Goal hit 🎉', body: `You're in the pool for ${c.name}.`, data: { challengeId: cid } });
    }
    if (counted > before) await notifyOvertaken(c.name, cid, String(userId), p.name, before, counted);
  }
}

/** Tells people they've just been passed. Rate-limited per person per challenge by `notify`. */
async function notifyOvertaken(challengeName: string, cid: string, userId: string, name: string, before: number, after: number) {
  const passed = await Participant.find({ challengeId: cid, userId: { $ne: userId }, steps: { $gte: before, $lt: after }, status: 'active' }, { userId: 1, steps: 1 })
    .sort({ steps: -1 })
    .limit(5)
    .lean();
  for (const other of passed) {
    const rank = await rankOf(cid, other.steps ?? 0);
    notify(other.userId, 'overtake', { title: `${name.split(' ')[0]} just passed you`, body: `You're #${rank} in ${challengeName}. ${after - (other.steps ?? 0) + 1} steps to take it back.`, data: { challengeId: cid } }, `overtaken:${cid}`);
  }
}
