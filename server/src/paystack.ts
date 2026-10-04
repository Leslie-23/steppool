import { createHmac, timingSafeEqual } from 'node:crypto';

import { config } from './config.js';
import { HttpError } from './errors.js';

const BASE = 'https://api.paystack.co';

/** Calls the Paystack API. Paystack answers `{ status, message, data }`; a false status is an error. */
export async function paystack<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  if (!config.paystackSecret) throw new HttpError(503, 'Payments are not set up yet');
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: { authorization: `Bearer ${config.paystackSecret}`, 'content-type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !json?.status) throw new HttpError(502, `Paystack: ${json?.message ?? res.statusText}`);
  return json.data as T;
}

export type PaystackTransaction = { reference: string; status: string; amount: number; currency: string; channel?: string; paid_at?: string };

export function initializeTransaction(body: { email: string; amount: number; reference: string; callback_url: string; metadata: Record<string, string> }) {
  return paystack<{ authorization_url: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: { ...body, currency: 'GHS', channels: ['mobile_money', 'card'] },
  });
}

export const verifyTransaction = (reference: string) => paystack<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);

export function createMomoRecipient(name: string, number: string, network: string) {
  return paystack<{ recipient_code: string }>('/transferrecipient', {
    method: 'POST',
    // Paystack wants the local format (024…), not +233.
    body: { type: 'mobile_money', name: name || 'StepPool player', account_number: number.replace(/^\+233/, '0'), bank_code: network, currency: 'GHS' },
  });
}

export function initiateTransfer(body: { amount: number; recipient: string; reference: string; reason: string }) {
  return paystack<{ transfer_code: string; status: string }>('/transfer', { method: 'POST', body: { source: 'balance', currency: 'GHS', ...body } });
}

/** Webhooks are signed with HMAC-SHA512 of the raw body, keyed by the secret key. */
export function validSignature(raw: Buffer, signature: string | undefined) {
  if (!config.paystackSecret || !signature) return false;
  const expected = createHmac('sha512', config.paystackSecret).update(raw).digest('hex');
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
