import { randomUUID } from 'node:crypto';

import express, { Router } from 'express';
import { z } from 'zod';

import { CASH, MOMO_NETWORKS, ghs } from '../../shared/cash.js';
import type { CashJoin, CashLine, CashWallet } from '../../shared/contracts.js';

import { requireUser } from './auth.js';
import { joinChallenge } from './challenges.js';
import { cashEnabledFor, config } from './config.js';
import { HttpError } from './errors.js';
import { cash, inTransaction, transfer } from './ledger.js';
import { Challenge, Ledger, Payment, User, Withdrawal, type UserDoc } from './models.js';
import { createMomoRecipient, initializeTransaction, initiateTransfer, validSignature, verifyTransaction, type PaystackTransaction } from './paystack.js';
import { notify } from './push.js';

const newReference = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '')}`;

async function cashUser(userId: string) {
  const user = await User.findById(userId).lean<UserDoc>();
  if (!user || !cashEnabledFor(user.email)) throw new HttpError(403, 'Cash challenges are not available yet');
  return user;
}

/**
 * Credits the wallet for a successful Paystack charge, exactly once, then joins the challenge it was for.
 * Called from the webhook and from the app's polling; whichever arrives first does the work.
 */
export async function confirmPayment(reference: string, tx?: PaystackTransaction) {
  const payment = await Payment.findOne({ reference });
  if (!payment) throw new HttpError(404, 'Unknown payment');
  if (payment.status !== 'pending') return payment;
  const t = tx ?? (await verifyTransaction(reference));
  if (t.status === 'failed' || t.status === 'abandoned') {
    await Payment.updateOne({ reference, status: 'pending' }, { $set: { status: 'failed' } });
    return (await Payment.findOne({ reference }))!;
  }
  if (t.status !== 'success') return payment;
  if (t.amount !== payment.amount || t.currency !== 'GHS') {
    console.error('paystack amount mismatch', reference, t.amount, payment.amount, t.currency);
    throw new HttpError(409, 'Payment amount does not match');
  }
  const credited = await inTransaction(async (session) => {
    const res = await Payment.updateOne({ reference, status: 'pending' }, { $set: { status: 'success', channel: t.channel, paidAt: t.paid_at ? new Date(t.paid_at) : new Date() } }, { session });
    if (res.modifiedCount !== 1) return false;
    await transfer(session, { from: cash.paystack, to: cash.user(payment.userId), amount: payment.amount, kind: 'deposit', ref: `paystack:${reference}`, challengeId: payment.challengeId ?? undefined });
    return true;
  });
  if (credited && payment.challengeId) {
    // If the challenge closed while they were paying, the money simply stays in their wallet.
    await joinChallenge(String(payment.challengeId), String(payment.userId)).catch((e) => {
      notify(payment.userId, 'announcement', { title: 'Payment received', body: `${(e as Error).message}. Your ${ghs(payment.amount)} is in your wallet.` });
    });
  }
  return (await Payment.findOne({ reference }))!;
}

async function failWithdrawal(reference: string, reason: string) {
  await inTransaction(async (session) => {
    const w = await Withdrawal.findOneAndUpdate({ reference, status: 'pending' }, { $set: { status: 'failed', reason } }, { session, returnDocument: 'after' });
    if (!w) return;
    await transfer(session, { from: cash.paystack, to: cash.user(w.userId), amount: w.amount, kind: 'withdrawal_reversal', ref: `wdrev:${reference}` });
    notify(w.userId, 'announcement', { title: 'Withdrawal failed', body: `${ghs(w.amount)} is back in your wallet. ${reason}` });
  });
}

export const cashRouter = Router();
cashRouter.use(requireUser);

cashRouter.get('/', async (req, res) => {
  const user = await User.findById(req.userId).lean<UserDoc>();
  if (!user || !cashEnabledFor(user.email)) {
    res.json({ enabled: false, balance: 0, lines: [], withdrawals: [] } satisfies CashWallet);
    return;
  }
  const [lines, withdrawals] = await Promise.all([
    Ledger.find({ account: cash.user(user._id) }).sort({ createdAt: -1 }).limit(100).lean(),
    Withdrawal.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const ids = [...new Set(lines.map((l) => l.challengeId && String(l.challengeId)).filter(Boolean))];
  const names = new Map((await Challenge.find({ _id: { $in: ids } }, { name: 1 }).lean()).map((c) => [String(c._id), c.name]));
  const body: CashWallet = {
    enabled: true,
    balance: user.cashPesewas ?? 0,
    lines: lines.map(
      (l): CashLine => ({
        id: String(l._id),
        amount: l.amount,
        kind: l.kind as CashLine['kind'],
        challengeName: l.challengeId ? names.get(String(l.challengeId)) : undefined,
        at: (l.createdAt as Date).toISOString(),
      }),
    ),
    withdrawals: withdrawals.map((w) => ({
      id: String(w._id),
      amount: w.amount,
      network: MOMO_NETWORKS[w.network as keyof typeof MOMO_NETWORKS] ?? w.network,
      momoNumber: w.momoNumber,
      status: w.status as 'pending' | 'success' | 'failed',
      reason: w.reason ?? undefined,
      at: (w.createdAt as Date).toISOString(),
    })),
    momo: user.momo?.number && user.momo.network ? { number: user.momo.number, network: user.momo.network } : undefined,
  };
  res.json(body);
});

/** Joins from the wallet if it covers the entry; otherwise starts a Paystack checkout for the difference. */
cashRouter.post('/challenges/:id/join', async (req, res) => {
  const user = await cashUser(req.userId!);
  const c = await Challenge.findById(req.params.id).lean();
  if (!c || c.kind !== 'cash') throw new HttpError(404, 'Challenge not found');
  const balance = user.cashPesewas ?? 0;
  if (balance >= c.entryPesewas) {
    res.json({ joined: await joinChallenge(String(c._id), req.userId!) } satisfies CashJoin);
    return;
  }
  const amount = c.entryPesewas - balance;
  const reference = newReference('sp');
  await Payment.create({ reference, userId: user._id, challengeId: c._id, amount });
  const { authorization_url } = await initializeTransaction({
    email: user.email,
    amount,
    reference,
    callback_url: `${config.publicUrl}/paid`,
    metadata: { userId: String(user._id), challengeId: String(c._id) },
  });
  res.json({ checkoutUrl: authorization_url, reference, amount } satisfies CashJoin);
});

/** The app polls this after the checkout closes. */
cashRouter.get('/payments/:reference', async (req, res) => {
  const p = await Payment.findOne({ reference: req.params.reference, userId: req.userId }).lean();
  if (!p) throw new HttpError(404, 'Unknown payment');
  const fresh = p.status === 'pending' ? await confirmPayment(p.reference) : p;
  res.json({ status: fresh.status, challengeId: fresh.challengeId ? String(fresh.challengeId) : undefined });
});

cashRouter.post('/withdraw', async (req, res) => {
  const body = z
    .object({
      amount: z.number().int().min(CASH.minWithdraw),
      momoNumber: z.string().regex(/^\+233\d{9}$/, 'Enter a Ghana number like +233241234567'),
      network: z.enum(['MTN', 'VOD', 'ATL']),
    })
    .parse(req.body);
  const user = await cashUser(req.userId!);
  if ((user.cashPesewas ?? 0) < body.amount) throw new HttpError(409, 'Not enough money in your wallet');

  let recipientCode = user.momo?.number === body.momoNumber && user.momo?.network === body.network ? user.momo?.recipientCode : undefined;
  if (!recipientCode) {
    recipientCode = (await createMomoRecipient(user.name ?? '', body.momoNumber, body.network)).recipient_code;
    await User.updateOne({ _id: user._id }, { $set: { momo: { number: body.momoNumber, network: body.network, recipientCode } } });
  }

  const reference = newReference('wd');
  await inTransaction(async (session) => {
    await transfer(session, { from: cash.user(user._id), to: cash.paystack, amount: body.amount, kind: 'withdrawal', ref: `wd:${reference}` });
    await Withdrawal.create([{ reference, userId: user._id, amount: body.amount, network: body.network, momoNumber: body.momoNumber }], { session });
  });
  try {
    const t = await initiateTransfer({ amount: body.amount, recipient: recipientCode, reference, reason: 'StepPool winnings' });
    await Withdrawal.updateOne({ reference }, { $set: { transferCode: t.transfer_code, ...(t.status === 'success' ? { status: 'success' } : {}) } });
  } catch (e) {
    await failWithdrawal(reference, 'Paystack could not start the transfer.');
    throw e;
  }
  res.status(201).json({ reference });
});

/** Paystack webhooks. Mounted before express.json, because the signature covers the raw body. */
export const paystackWebhook = Router();
paystackWebhook.post('/paystack/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  if (!validSignature(req.body as Buffer, req.header('x-paystack-signature'))) {
    res.sendStatus(401);
    return;
  }
  const { event, data } = JSON.parse((req.body as Buffer).toString('utf8')) as { event: string; data: PaystackTransaction & { reason?: string } };
  try {
    if (event === 'charge.success') await confirmPayment(data.reference, data);
    else if (event === 'transfer.success') await Withdrawal.updateOne({ reference: data.reference, status: 'pending' }, { $set: { status: 'success' } });
    else if (event === 'transfer.failed' || event === 'transfer.reversed') await failWithdrawal(data.reference, 'The mobile money transfer did not go through.');
  } catch (e) {
    // Unknown references (e.g. payments made outside StepPool) are acknowledged so Paystack stops retrying.
    if ((e as { status?: number }).status !== 404) throw e;
  }
  res.sendStatus(200);
});
