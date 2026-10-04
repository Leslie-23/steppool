import * as WebBrowser from 'expo-web-browser';

import type { ChallengeSummary } from '@/shared/contracts';

import { api } from './api';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Joins a cash challenge: straight from the wallet if it covers the entry, otherwise through Paystack's
 * checkout in an in-app browser. Paystack redirects to /paid, which bounces to steppool://paid and closes it.
 * Returns the joined challenge, or null if the player backed out before paying.
 */
export async function payAndJoin(challengeId: string): Promise<ChallengeSummary | null> {
  const res = await api.cashJoin(challengeId);
  if ('joined' in res) return res.joined;
  await WebBrowser.openAuthSessionAsync(res.checkoutUrl, 'steppool://paid');
  // Closing the sheet doesn't say whether they paid, and a MoMo approval can land a few seconds later, so ask the server.
  for (let i = 0; i < 6; i++) {
    const p = await api.payment(res.reference).catch(() => null);
    if (p?.status === 'success') return api.challenge(challengeId);
    if (p?.status === 'failed') throw new Error('The payment did not go through');
    await sleep(2500);
  }
  // Still pending: most likely they backed out. If a MoMo approval does come through later, the webhook joins them.
  return null;
}
