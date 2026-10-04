import { ghs, splitCash } from '../../shared/cash.js';

import { Challenge, Participant, Payout } from './models.js';
import { account, balanceOf, cash, inTransaction, transfer } from './ledger.js';
import { notify } from './push.js';
import { emit, setScore } from './realtime.js';
import { sumBuckets } from './steps.js';

/** Even split in whole credits; the indivisible remainder goes to the house. */
export function splitPool(pool: number, finishers: number) {
  if (finishers <= 0) return { per: 0, remainder: pool };
  const per = Math.floor(pool / finishers);
  return { per, remainder: pool - per * finishers };
}

/** Sponsor cash split, rounded down to the pesewa. */
export function splitPrize(valueGhs: number, winners: number) {
  return winners > 0 ? Math.floor((valueGhs / winners) * 100) / 100 : 0;
}

/**
 * Finalises a challenge after its sync cutoff: freezes totals from verified buckets,
 * pays everyone who hit their goal (or refunds everyone if nobody did), and records prizes.
 * Safe to call repeatedly; only one caller wins the live→settling transition.
 */
export async function settleChallenge(challengeId: string, now = new Date()) {
  const c = await Challenge.findOneAndUpdate({ _id: challengeId, status: 'live', syncCutoffAt: { $lte: now } }, { $set: { status: 'settling' } }, { returnDocument: 'after' });
  if (!c) return null;
  const cid = String(c._id);
  const winnerIds = new Set<string>();
  let cashSplit: ReturnType<typeof splitCash> | undefined;
  const everyone: string[] = [];

  try {
    const parts = await Participant.find({ challengeId: c._id, status: 'active' });
    for (const p of parts) {
      const { counted, held } = await sumBuckets(p.userId, c.startsAt, c.endsAt);
      p.steps = counted;
      p.heldSteps = held;
      if (counted >= p.goal && !p.goalHitAt) p.goalHitAt = now;
      await setScore(cid, String(p.userId), counted);
    }
    const finishers = parts
      .filter((p) => (p.steps ?? 0) >= p.goal)
      .sort((a, b) => (a.goalHitAt?.getTime() ?? 0) - (b.goalHitAt?.getTime() ?? 0));
    const finisherIds = new Set(finishers.map((p) => String(p._id)));
    for (const p of finishers) winnerIds.add(String(p.userId));
    for (const p of parts) everyone.push(String(p.userId));

    await inTransaction(async (session) => {
      let per = 0;
      let perMisser: number | undefined;
      if (c.kind === 'cash') {
        // Everyone gets something back: finishers their entry plus a share of the forfeits, missers at least 40%.
        const pool = cash.pool(c._id);
        const split = (cashSplit = splitCash(c.entryPesewas, parts.length, finishers.length));
        per = split.winnerGets;
        perMisser = split.loserGets;
        for (const p of parts) {
          const won = finisherIds.has(String(p._id));
          const amount = won ? split.winnerGets : split.loserGets;
          if (amount > 0) await transfer(session, { from: pool, to: cash.user(p.userId), amount, kind: won ? 'payout' : 'refund', challengeId: c._id });
          p.wonPesewas = amount;
        }
        if (split.rake > 0) await transfer(session, { from: pool, to: cash.house, amount: split.rake, kind: 'rake', challengeId: c._id });
        // Whatever is left (the indivisible remainder, or anything unexpected) goes to the house; the pool ends at zero.
        const left = await balanceOf(pool, session);
        if (left > 0) await transfer(session, { from: pool, to: cash.house, amount: left, kind: 'house_remainder', challengeId: c._id });
        if (left < 0) throw new Error(`Cash pool ${cid} went negative`);
      } else if (c.kind === 'credits') {
        const pool = await balanceOf(account.pool(c._id), session);
        if (finishers.length) {
          const split = splitPool(pool, finishers.length);
          per = split.per;
          for (const p of finishers) {
            if (per > 0) await transfer(session, { from: account.pool(c._id), to: account.user(p.userId), amount: per, kind: 'payout', challengeId: c._id });
            p.wonCredits = per;
          }
          if (split.remainder > 0) await transfer(session, { from: account.pool(c._id), to: account.house, amount: split.remainder, kind: 'house_remainder', challengeId: c._id });
        } else if (pool > 0) {
          // Nobody made it: everyone gets their entry back rather than the house keeping it.
          for (const p of parts) {
            if (c.entryCredits > 0) await transfer(session, { from: account.pool(c._id), to: account.user(p.userId), amount: c.entryCredits, kind: 'refund', challengeId: c._id });
          }
        }
      } else {
        const winners = finishers.slice(0, c.sponsor?.maxWinners ?? finishers.length);
        const each = splitPrize(c.sponsor?.prizeValueGhs ?? 0, winners.length);
        await Payout.insertMany(
          winners.map((p) => ({
            challengeId: c._id,
            userId: p.userId,
            kind: 'sponsor_prize',
            amount: each,
            prizeDescription: `GH₵${each.toLocaleString('en-GH', { minimumFractionDigits: 2 })} from ${c.sponsor?.name}`,
          })),
          { session },
        );
      }
      for (const p of parts) {
        p.status = finisherIds.has(String(p._id)) ? 'finished' : 'missed';
        await p.save({ session });
      }
      await Challenge.updateOne({ _id: c._id }, { $set: { status: 'settled', finishers: finishers.length, perFinisher: per, perMisser } }, { session });
    });
  } catch (e) {
    await Challenge.updateOne({ _id: c._id, status: 'settling' }, { $set: { status: 'live' } });
    throw e;
  }

  emit(cid, 'challenge:settled', { challengeId: cid });
  for (const userId of everyone) {
    const won = winnerIds.has(userId);
    const cashBody = cashSplit && `${ghs(won ? cashSplit.winnerGets : cashSplit.loserGets)} is in your wallet.`;
    notify(userId, 'results', {
      title: won ? 'You made it 🏆' : `${c.name} is over`,
      body: cashBody ?? (won ? `Results are in for ${c.name}. Collect your share.` : 'See how everyone finished.'),
      data: { challengeId: cid, results: '1' },
    });
  }
  return { finishers: winnerIds.size };
}
