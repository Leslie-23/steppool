import { randomUUID } from 'node:crypto';

import { Router } from 'express';

import { sponsorTotal } from '../../shared/cash.js';
import { SponsorCheckoutBody } from '../../shared/contracts.js';

import { createChallenge } from './challenges.js';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { cash, inTransaction, transfer } from './ledger.js';
import { Challenge, Payout, SponsorOrder, User } from './models.js';
import { createMomoRecipient, initializeTransaction, initiateTransfer, verifyTransaction, type PaystackTransaction } from './paystack.js';
import { notify } from './push.js';

const newReference = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '')}`;

/** Claims store the network as the app shows it; Paystack wants its bank code. */
const NETWORK_CODE: Record<string, string> = { mtn: 'MTN', telecel: 'VOD', airteltigo: 'ATL', MTN: 'MTN', VOD: 'VOD', ATL: 'ATL' };

export const isSponsorReference = (ref: string) => ref.startsWith('so_');
export const isPrizeReference = (ref: string) => ref.startsWith('pz_');

/**
 * Records a paid sponsor order exactly once: the prize goes into the held prize account, the fee to the house,
 * and the sponsored challenge is created, public, with the brand's details.
 */
export async function confirmSponsorOrder(reference: string, tx?: PaystackTransaction) {
  const order = await SponsorOrder.findOne({ reference });
  if (!order) throw new HttpError(404, 'Unknown order');
  if (order.status !== 'pending') return order;
  const t = tx ?? (await verifyTransaction(reference));
  if (t.status === 'failed' || t.status === 'abandoned') {
    await SponsorOrder.updateOne({ reference, status: 'pending' }, { $set: { status: 'failed' } });
    return (await SponsorOrder.findOne({ reference }))!;
  }
  if (t.status !== 'success') return order;
  if (t.amount !== order.amount || t.currency !== 'GHS') {
    console.error('sponsor amount mismatch', reference, t.amount, order.amount);
    throw new HttpError(409, 'Payment amount does not match');
  }
  const paid = await inTransaction(async (session) => {
    const res = await SponsorOrder.updateOne({ reference, status: 'pending' }, { $set: { status: 'paid', paidAt: new Date() } }, { session });
    if (res.modifiedCount !== 1) return false;
    await transfer(session, { from: cash.paystack, to: cash.prizes, amount: order.prizePesewas, kind: 'sponsor_fund', ref: `so:${reference}`, note: order.company });
    if (order.feePesewas > 0) await transfer(session, { from: cash.paystack, to: cash.house, amount: order.feePesewas, kind: 'sponsor_fee', ref: `sofee:${reference}`, note: order.company });
    return true;
  });
  if (!paid) return (await SponsorOrder.findOne({ reference }))!;

  // The start may have been picked a while ago; if it has passed, start at the next hour instead.
  const startsAt = order.startsAt && order.startsAt.getTime() > Date.now() ? order.startsAt.toISOString() : undefined;
  const c = await createChallenge({
    name: order.challengeName,
    kind: 'sponsored',
    visibility: 'public',
    durationHours: order.durationHours as 48 | 168 | 720,
    startsAt,
    sponsor: {
      name: order.company,
      logoUrl: order.logoUrl ?? undefined,
      prizeDescription: order.prizeDescription,
      prizeValueGhs: order.prizeValueGhs,
      maxWinners: order.maxWinners ?? undefined,
    },
  });
  await Challenge.updateOne({ _id: c._id }, { $set: { sponsorOrderId: order._id } });
  await SponsorOrder.updateOne({ _id: order._id }, { $set: { challengeId: c._id } });
  return (await SponsorOrder.findOne({ reference }))!;
}

/** Sends a claimed sponsor prize to the winner's MoMo through Paystack. Only for prizes a sponsor paid for online. */
export async function sendPrize(payoutId: string) {
  const p = await Payout.findOne({ _id: payoutId, status: 'claimed', kind: 'sponsor_prize' });
  if (!p?.claim?.momoNumber) throw new HttpError(404, 'No claimed prize with that id');
  const c = await Challenge.findById(p.challengeId, { sponsorOrderId: 1 }).lean();
  if (!c?.sponsorOrderId) throw new HttpError(409, 'This prize was not paid for through Paystack; pay it yourself and mark it sent');
  const amount = Math.round((p.amount ?? 0) * 100);
  if (amount <= 0) throw new HttpError(409, 'Nothing to send');
  const user = await User.findById(p.userId, { name: 1 }).lean();
  const network = NETWORK_CODE[p.claim.network ?? ''];
  if (!network) throw new HttpError(400, `Unknown network ${p.claim.network}`);
  const { recipient_code } = await createMomoRecipient(user?.name ?? '', p.claim.momoNumber, network);

  const reference = newReference('pz');
  await inTransaction(async (session) => {
    const res = await Payout.updateOne({ _id: p._id, status: 'claimed' }, { $set: { status: 'sending', transferRef: reference }, $unset: { lastError: 1 } }, { session });
    if (res.modifiedCount !== 1) throw new HttpError(409, 'Already being sent');
    await transfer(session, { from: cash.prizes, to: cash.paystack, amount, kind: 'prize_payout', challengeId: p.challengeId, ref: `pz:${reference}` });
  });
  try {
    const t = await initiateTransfer({ amount, recipient: recipient_code, reference, reason: p.prizeDescription ?? 'StepPool prize' });
    if (t.status === 'success') await prizeSent(reference);
  } catch (e) {
    await prizeFailed(reference, (e as Error).message);
    throw e;
  }
  return reference;
}

export async function prizeSent(reference: string) {
  const p = await Payout.findOneAndUpdate({ transferRef: reference, status: 'sending' }, { $set: { status: 'fulfilled' } }, { returnDocument: 'after' });
  if (p) notify(p.userId, 'results', { title: 'Your prize is on its way', body: `${p.prizeDescription ?? 'Your prize'} has been sent to your MoMo.` });
}

/** A failed prize transfer goes back to "claimed" so an admin can retry, and the money back to the held prizes. */
export async function prizeFailed(reference: string, reason: string) {
  await inTransaction(async (session) => {
    const p = await Payout.findOneAndUpdate({ transferRef: reference, status: 'sending' }, { $set: { status: 'claimed', lastError: reason } }, { session, returnDocument: 'after' });
    if (!p) return;
    await transfer(session, { from: cash.paystack, to: cash.prizes, amount: Math.round((p.amount ?? 0) * 100), kind: 'prize_payout_reversal', challengeId: p.challengeId, ref: `pzrev:${reference}` });
  });
}

/** Public: brands don't have StepPool accounts. */
export const sponsorRouter = Router();

sponsorRouter.post('/checkout', async (req, res) => {
  const body = SponsorCheckoutBody.parse(req.body);
  const { prize, fee, total } = sponsorTotal(body.prizeValueGhs, config.sponsorFeePct);
  const reference = newReference('so');
  await SponsorOrder.create({ ...body, startsAt: body.startsAt ? new Date(body.startsAt) : undefined, reference, prizePesewas: prize, feePesewas: fee, amount: total });
  const { authorization_url } = await initializeTransaction({
    email: body.email,
    amount: total,
    reference,
    callback_url: `${config.webUrl}/sponsor/thanks`,
    metadata: { kind: 'sponsor', company: body.company },
  });
  res.status(201).json({ checkoutUrl: authorization_url, reference, prize, fee, total });
});

sponsorRouter.get('/quote', (req, res) => {
  const prizeGhs = Number(req.query.prize ?? 0);
  res.json({ feePct: config.sponsorFeePct, ...sponsorTotal(Number.isFinite(prizeGhs) ? prizeGhs : 0, config.sponsorFeePct) });
});

/** The thank-you page polls this. The reference is unguessable, so it doubles as the order's secret. */
sponsorRouter.get('/orders/:reference', async (req, res) => {
  let order = await SponsorOrder.findOne({ reference: req.params.reference });
  if (!order) throw new HttpError(404, 'Unknown order');
  if (order.status === 'pending') order = await confirmSponsorOrder(order.reference).catch(() => order!);
  const c = order.challengeId ? await Challenge.findById(order.challengeId, { inviteCode: 1, startsAt: 1, endsAt: 1 }).lean() : null;
  res.json({
    status: order.status,
    company: order.company,
    challengeName: order.challengeName,
    prizeDescription: order.prizeDescription,
    total: order.amount,
    challenge: c ? { inviteCode: c.inviteCode, link: `${config.publicUrl}/j/${c.inviteCode}`, startsAt: c.startsAt, endsAt: c.endsAt } : null,
  });
});
