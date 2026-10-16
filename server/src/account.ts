import { ghs } from '../../shared/cash.js';

import { HttpError } from './errors.js';
import { Challenge, HourBucket, Notification, Participant, Payout, StepSampleModel, User, Withdrawal } from './models.js';
import { markDirty, removeScore } from './realtime.js';

/**
 * Deletes an account (App Store guideline 5.1.1(v)). Personal data goes: profile, step data, notifications,
 * unclaimed prizes, live challenge places. Kept, without personal details: ledger lines (so challenge pools
 * still add up) and payment/withdrawal records (financial records). Finished challenge results keep the
 * place, renamed "Deleted walker", so other players' results don't change.
 * Refused while the user still has real money with us, so nobody loses cash by accident.
 */
export async function deleteAccount(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) return;

  if ((user.cashPesewas ?? 0) > 0) throw new HttpError(409, `Withdraw your ${ghs(user.cashPesewas ?? 0)} first, then delete your account.`);
  if (await Withdrawal.exists({ userId, status: 'pending' })) throw new HttpError(409, 'A withdrawal is still on its way. Try again once it has arrived.');
  const live = await Participant.find({ userId, status: 'active' }).lean();
  const liveChallenges = await Challenge.find({ _id: { $in: live.map((p) => p.challengeId) }, status: { $in: ['upcoming', 'live', 'settling'] } }, { kind: 1, status: 1 }).lean();
  if (liveChallenges.some((c) => c.kind === 'cash')) throw new HttpError(409, "You're in a cash challenge that hasn't finished. Delete your account once it settles.");
  if (liveChallenges.some((c) => c.status === 'settling')) throw new HttpError(409, 'A challenge you are in is being settled. Try again in a few minutes.');

  // Leave live challenges: the place goes, the credit entry stays in the pool for the other players.
  for (const c of liveChallenges) {
    await Participant.deleteOne({ challengeId: c._id, userId });
    await Challenge.updateOne({ _id: c._id, players: { $gt: 0 } }, { $inc: { players: -1 } });
    await removeScore(String(c._id), userId);
    markDirty(String(c._id));
  }
  await Participant.updateMany({ userId }, { $set: { name: 'Deleted walker' } });
  await Promise.all([
    StepSampleModel.deleteMany({ userId }),
    HourBucket.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    Payout.deleteMany({ userId, status: { $in: ['pending', 'claimed'] } }),
    User.updateMany({ referredBy: userId }, { $unset: { referredBy: 1 } }),
  ]);
  await User.deleteOne({ _id: userId });
}
