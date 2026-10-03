import { randomUUID } from 'node:crypto';

import mongoose, { type ClientSession, type Types } from 'mongoose';

import type { LedgerKind } from '../../shared/contracts.js';

import { Ledger, User } from './models.js';

type Kind = LedgerKind;

export const account = {
  user: (id: Types.ObjectId | string) => `user:${id}`,
  pool: (id: Types.ObjectId | string) => `pool:${id}`,
  house: 'house',
  mint: 'mint',
};

export class InsufficientCredits extends Error {
  status = 409;
  constructor() {
    super('Not enough credits');
  }
}

/**
 * Moves credits between two accounts as one double-entry transaction.
 * When either side is a user, that user's cached balance is updated in the same session;
 * a debit is conditional on the cache covering it, which serialises concurrent spends.
 */
export async function transfer(
  session: ClientSession,
  { from, to, amount, kind, challengeId, note, by, ref }: { from: string; to: string; amount: number; kind: Kind; challengeId?: Types.ObjectId; note?: string; by?: Types.ObjectId; ref?: string },
) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`Invalid amount ${amount}`);
  const txId = randomUUID();
  if (from.startsWith('user:')) {
    const res = await User.updateOne({ _id: from.slice(5), credits: { $gte: amount } }, { $inc: { credits: -amount } }, { session });
    if (res.modifiedCount !== 1) throw new InsufficientCredits();
  }
  if (to.startsWith('user:')) {
    await User.updateOne({ _id: to.slice(5) }, { $inc: { credits: amount } }, { session });
  }
  await Ledger.insertMany(
    [
      { txId, account: from, amount: -amount, kind, challengeId, note, by },
      { txId, account: to, amount, kind, challengeId, note, by, ref },
    ],
    { session, ordered: true },
  );
  return txId;
}

export async function balanceOf(acct: string, session?: ClientSession) {
  const [row] = await Ledger.aggregate<{ total: number }>([{ $match: { account: acct } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).session(session ?? null);
  return row?.total ?? 0;
}

/** Runs `fn` in a Mongo transaction with automatic retry on transient errors. */
export async function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
