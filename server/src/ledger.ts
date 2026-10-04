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

/** Real money, in pesewas. Kept in separate accounts so it can never mix with credits. */
export const cash = {
  user: (id: Types.ObjectId | string) => `cash:user:${id}`,
  pool: (id: Types.ObjectId | string) => `cash:pool:${id}`,
  house: 'cash:house',
  /** Money held at Paystack: deposits come from here, withdrawals go back to it. */
  paystack: 'cash:paystack',
};

export class InsufficientCredits extends Error {
  status = 409;
  constructor(message = 'Not enough credits') {
    super(message);
  }
}

/** The user document field that caches an account's balance, if it is a user account. */
function cachedBalance(acct: string): { field: 'credits' | 'cashPesewas'; userId: string } | null {
  if (acct.startsWith('user:')) return { field: 'credits', userId: acct.slice(5) };
  if (acct.startsWith('cash:user:')) return { field: 'cashPesewas', userId: acct.slice(10) };
  return null;
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
  const isCash = from.startsWith('cash:');
  if (isCash !== to.startsWith('cash:')) throw new Error(`Cannot move between credits and cash (${from} → ${to})`);
  const currency = isCash ? 'GHS' : 'CREDIT';
  const txId = randomUUID();
  const debit = cachedBalance(from);
  if (debit) {
    const res = await User.updateOne({ _id: debit.userId, [debit.field]: { $gte: amount } }, { $inc: { [debit.field]: -amount } }, { session });
    if (res.modifiedCount !== 1) throw new InsufficientCredits(isCash ? 'Not enough money in your wallet' : undefined);
  }
  const credit = cachedBalance(to);
  if (credit) {
    await User.updateOne({ _id: credit.userId }, { $inc: { [credit.field]: amount } }, { session });
  }
  await Ledger.insertMany(
    [
      { txId, account: from, amount: -amount, currency, kind, challengeId, note, by },
      { txId, account: to, amount, currency, kind, challengeId, note, by, ref },
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
