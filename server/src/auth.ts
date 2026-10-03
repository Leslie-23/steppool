import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { SIGNUP_CREDITS } from '../../shared/contracts.js';

import { config } from './config.js';
import { HttpError } from './errors.js';
import { account, inTransaction, transfer } from './ledger.js';
import { User, type UserDoc } from './models.js';
import { redis } from './redis.js';
import { mailEnabled, sendOtpEmail } from './mailer.js';
import { verifyProviderToken, type Provider } from './oauth.js';
import { toMe } from './views.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';
const OTP_TTL_S = 300;
const OTP_MAX_ATTEMPTS = 5;

const Email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

type AccessClaims = { sub: string; typ: 'access' };
type RefreshClaims = { sub: string; typ: 'refresh'; tv: number };

export function issueTokens(user: Pick<UserDoc, '_id' | 'tokenVersion'>) {
  const sub = String(user._id);
  return {
    access: jwt.sign({ sub, typ: 'access' } satisfies AccessClaims, config.jwtSecret, { expiresIn: ACCESS_TTL }),
    refresh: jwt.sign({ sub, typ: 'refresh', tv: user.tokenVersion ?? 0 } satisfies RefreshClaims, config.jwtSecret, { expiresIn: REFRESH_TTL }),
  };
}

export function verifyAccess(token: string): string | null {
  try {
    const claims = jwt.verify(token, config.jwtSecret) as AccessClaims;
    return claims.typ === 'access' ? claims.sub : null;
  } catch {
    return null;
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const sub = token ? verifyAccess(token) : null;
  if (!sub) return next(new HttpError(401, 'Sign in again'));
  req.userId = sub;
  next();
}

/**
 * Admin access: either the server's API key (scripts, cron) or a signed-in user with the admin role
 * (the web console). The role is re-read from the database on every request, so revoking is instant.
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const key = req.header('x-admin-key');
  if (key) {
    const a = Buffer.from(key);
    const b = Buffer.from(config.adminKey);
    return a.length === b.length && timingSafeEqual(a, b) ? next() : next(new HttpError(403, 'Forbidden'));
  }
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const sub = token ? verifyAccess(token) : null;
  if (!sub) return next(new HttpError(401, 'Sign in again'));
  const u = await User.findById(sub, { role: 1 }).lean();
  if (u?.role !== 'admin') return next(new HttpError(403, 'Admins only'));
  req.userId = sub;
  next();
}

/** Promotes allow-listed emails to admin on sign-in. */
async function applyAdminRole(user: UserDoc) {
  if (user.role !== 'admin' && config.adminEmails.includes(user.email)) {
    await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } });
    user.role = 'admin';
  }
}

/** Fixed-window limiter in Redis. */
export async function limit(key: string, max: number, windowS: number) {
  const r = redis();
  const n = await r.incr(`rl:${key}`);
  if (n === 1) await r.expire(`rl:${key}`, windowS);
  if (n > max) throw new HttpError(429, 'Too many attempts. Try again shortly.');
}

const hash = (email: string, code: string) => createHash('sha256').update(`${email}:${code}:${config.jwtSecret}`).digest('hex');

export const authRouter = Router();

authRouter.post('/otp', async (req, res) => {
  const email = Email.parse(req.body?.email);
  await limit(`otp:email:${email}`, 5, 3600);
  await limit(`otp:ip:${req.ip}`, 20, 3600);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await redis().set(`otp:${email}`, JSON.stringify({ h: hash(email, code), n: 0 }), 'EX', OTP_TTL_S);
  if (mailEnabled()) {
    await sendOtpEmail(email, code).catch((e) => {
      console.error('otp email failed', e);
      throw new HttpError(502, "We couldn't send the email. Try again in a moment.");
    });
  } else if (config.production) {
    throw new HttpError(503, 'Sign-in email is not configured');
  }
  res.json(config.otpInResponse ? { devCode: code } : {});
});

authRouter.post('/verify', async (req, res) => {
  const { email, code } = z.object({ email: Email, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const key = `otp:${email}`;
  const raw = await redis().get(key);
  if (!raw) throw new HttpError(400, 'Code expired. Request a new one.');
  const entry = JSON.parse(raw) as { h: string; n: number };
  if (entry.n >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'Too many attempts. Request a new code.');
  if (entry.h !== hash(email, code)) {
    await redis().set(key, JSON.stringify({ ...entry, n: entry.n + 1 }), 'KEEPTTL');
    throw new HttpError(400, 'Wrong code');
  }
  await redis().del(key);

  let user = await User.findOne({ email });
  const isNew = !user;
  if (!user) user = await createUser({ email });
  await applyAdminRole(user);
  res.json({ tokens: issueTokens(user), me: toMe(user), isNew });
});

/** New account with its signup credits, in one transaction. */
async function createUser(fields: { email: string; name?: string; appleSub?: string; googleSub?: string }) {
  const created = await inTransaction(async (session) => {
    const [u] = await User.create([fields], { session });
    await transfer(session, { from: account.mint, to: account.user(u._id), amount: SIGNUP_CREDITS, kind: 'signup_grant' });
    return u;
  });
  return (await User.findById(created._id))!;
}

/**
 * Sign in with Apple / Google. Match on the provider's stable user id first; otherwise link to an
 * existing account with the same *verified* email; otherwise create one. Unverified emails never link,
 * or anyone could claim someone else's account by asserting their address.
 */
async function signInWithProvider(provider: Provider, token: string, name?: string) {
  const claims = await verifyProviderToken(provider, token);
  const subField = provider === 'apple' ? 'appleSub' : 'googleSub';
  const email = claims.email?.trim().toLowerCase();
  const cleanName = (name ?? claims.name)?.trim().slice(0, 24) || undefined;

  let user = await User.findOne({ [subField]: claims.sub });
  let isNew = false;
  if (!user && email && claims.emailVerified) {
    user = await User.findOneAndUpdate({ email }, { $set: { [subField]: claims.sub } }, { returnDocument: 'after' });
  }
  if (!user) {
    isNew = true;
    // Use the provider email only if it's verified and not already someone else's account. Otherwise
    // (Apple withheld it, it's unverified, or it's taken) keep a unique placeholder so the account still works.
    const usable = email && claims.emailVerified && !(await User.exists({ email })) ? email : null;
    user = await createUser({ email: usable ?? `${provider}.${claims.sub}@users.steppool.app`, name: cleanName, [subField]: claims.sub });
  } else if (!user.name && cleanName) {
    user.name = cleanName;
    await user.save();
  }
  await applyAdminRole(user);
  return { tokens: issueTokens(user), me: toMe(user), isNew };
}

authRouter.post('/apple', async (req, res) => {
  const body = z.object({ identityToken: z.string().min(20), name: z.string().max(60).optional() }).parse(req.body);
  await limit(`oauth:ip:${req.ip}`, 30, 3600);
  res.json(await signInWithProvider('apple', body.identityToken, body.name));
});

authRouter.post('/google', async (req, res) => {
  const body = z.object({ idToken: z.string().min(20) }).parse(req.body);
  await limit(`oauth:ip:${req.ip}`, 30, 3600);
  res.json(await signInWithProvider('google', body.idToken));
});

authRouter.post('/refresh', async (req, res) => {
  const token = z.object({ refresh: z.string() }).parse(req.body).refresh;
  let claims: RefreshClaims;
  try {
    claims = jwt.verify(token, config.jwtSecret) as RefreshClaims;
  } catch {
    throw new HttpError(401, 'Sign in again');
  }
  const user = await User.findById(claims.sub);
  if (claims.typ !== 'refresh' || !user || (user.tokenVersion ?? 0) !== claims.tv) throw new HttpError(401, 'Sign in again');
  res.json(issueTokens(user));
});
