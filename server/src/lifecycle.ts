import { Challenge, Participant } from './models.js';
import { notify } from './push.js';
import { markDirty } from './realtime.js';
import { settleChallenge } from './settle.js';

export async function startChallenge(challengeId: string, now = new Date()) {
  const c = await Challenge.findOneAndUpdate({ _id: challengeId, status: 'upcoming', startsAt: { $lte: now } }, { $set: { status: 'live' } }, { returnDocument: 'after' });
  if (!c) return;
  markDirty(challengeId);
  for (const p of await Participant.find({ challengeId }, { userId: 1, goal: 1 }).lean()) {
    notify(p.userId, { title: `${c.name} is live`, body: `Your goal: ${p.goal.toLocaleString()} steps. Go.`, data: { challengeId } });
  }
}

export async function lastHour(challengeId: string) {
  const c = await Challenge.findOneAndUpdate({ _id: challengeId, status: 'live', lastHourPushed: false }, { $set: { lastHourPushed: true } }, { returnDocument: 'after' });
  if (!c) return;
  for (const p of await Participant.find({ challengeId, status: 'active' }).lean()) {
    const left = p.goal - (p.steps ?? 0);
    if (left <= 0) continue;
    notify(p.userId, { title: '1 hour left ⏱', body: `${left.toLocaleString()} steps to your goal in ${c.name}. You can still make it.`, data: { challengeId } });
  }
}

/** Catches anything a delayed job missed. Runs every few minutes. */
export async function sweep(now = new Date()) {
  const due = await Challenge.find(
    { $or: [{ status: 'upcoming', startsAt: { $lte: now } }, { status: 'live', syncCutoffAt: { $lte: now } }, { status: 'live', lastHourPushed: false, endsAt: { $lte: new Date(now.getTime() + 3_600_000) } }] },
    { status: 1, startsAt: 1, endsAt: 1, syncCutoffAt: 1, lastHourPushed: 1 },
  ).lean();
  for (const c of due) {
    const id = String(c._id);
    if (c.status === 'upcoming') await startChallenge(id, now);
    else if (c.syncCutoffAt <= now) await settleChallenge(id, now);
    else await lastHour(id);
  }
  // Settlements that crashed mid-way were reverted to live by settleChallenge and are retried above.
}
