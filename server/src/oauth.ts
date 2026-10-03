import { createRemoteJWKSet, jwtVerify } from 'jose';

import { config } from './config.js';
import { HttpError } from './errors.js';

export type Provider = 'apple' | 'google';
export type ProviderClaims = { sub: string; email?: string; emailVerified: boolean; name?: string };

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const truthy = (v: unknown) => v === true || v === 'true';

/** Verifies a Sign in with Apple identity token (signature, issuer, audience = our bundle id, expiry). */
async function verifyApple(token: string): Promise<ProviderClaims> {
  const { payload } = await jwtVerify(token, APPLE_JWKS, { issuer: 'https://appleid.apple.com', audience: config.appleAudiences });
  return { sub: String(payload.sub), email: payload.email as string | undefined, emailVerified: truthy(payload.email_verified) };
}

/** Verifies a Google ID token (signature, issuer, audience = one of our OAuth client ids, expiry). */
async function verifyGoogle(token: string): Promise<ProviderClaims> {
  if (!config.googleClientIds.length) throw new HttpError(503, 'Google sign-in is not configured');
  const { payload } = await jwtVerify(token, GOOGLE_JWKS, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: config.googleClientIds });
  return { sub: String(payload.sub), email: payload.email as string | undefined, emailVerified: truthy(payload.email_verified), name: payload.name as string | undefined };
}

let override: ((provider: Provider, token: string) => Promise<ProviderClaims>) | null = null;
/** Test seam: replace provider verification (never set outside tests). */
export const setProviderVerifierForTests = (fn: typeof override) => (override = fn);

export async function verifyProviderToken(provider: Provider, token: string): Promise<ProviderClaims> {
  if (override) return override(provider, token);
  try {
    return provider === 'apple' ? await verifyApple(token) : await verifyGoogle(token);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, `That ${provider === 'apple' ? 'Apple' : 'Google'} sign-in didn't verify. Try again.`);
  }
}
