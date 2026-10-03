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
import { sendSms } from './sms.js';
import { toMe } from './views.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '30d';
const OTP_TTL_S = 300;
const OTP_MAX_ATTEMPTS = 5;

const Phone = z.string().regex(/^\+233\d{9}$/, 'Use a Ghana number');

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

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const key = req.header('x-admin-key') ?? '';
  const a = Buffer.from(key);
  const b = Buffer.from(config.adminKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return next(new HttpError(403, 'Forbidden'));
  next();
}

/** Fixed-window limiter in Redis. */
export async function limit(key: string, max: number, windowS: number) {
  const r = redis();
  const n = await r.incr(`rl:${key}`);
  if (n === 1) await r.expire(`rl:${key}`, windowS);
  if (n > max) throw new HttpError(429, 'Too many attempts. Try again shortly.');
}

const hash = (phone: string, code: string) => createHash('sha256').update(`${phone}:${code}:${config.jwtSecret}`).digest('hex');

export const authRouter = Router();

authRouter.post('/otp', async (req, res) => {
  const phone = Phone.parse(req.body?.phone);
  await limit(`otp:phone:${phone}`, 5, 3600);
  await limit(`otp:ip:${req.ip}`, 20, 3600);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await redis().set(`otp:${phone}`, JSON.stringify({ h: hash(phone, code), n: 0 }), 'EX', OTP_TTL_S);
  if (config.arkeselKey) await sendSms(phone, `Your StepPool code is ${code}. It expires in 5 minutes.`);
  res.json(config.otpInResponse ? { devCode: code } : {});
});

authRouter.post('/verify', async (req, res) => {
  const { phone, code } = z.object({ phone: Phone, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const key = `otp:${phone}`;
  const raw = await redis().get(key);
  if (!raw) throw new HttpError(400, 'Code expired. Request a new one.');
  const entry = JSON.parse(raw) as { h: string; n: number };
  if (entry.n >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'Too many attempts. Request a new code.');
  if (entry.h !== hash(phone, code)) {
    await redis().set(key, JSON.stringify({ ...entry, n: entry.n + 1 }), 'KEEPTTL');
    throw new HttpError(400, 'Wrong code');
  }
  await redis().del(key);

  let user = await User.findOne({ phone });
  const isNew = !user;
  if (!user) {
    user = await inTransaction(async (session) => {
      const [created] = await User.create([{ phone }], { session });
      await transfer(session, { from: account.mint, to: account.user(created._id), amount: SIGNUP_CREDITS, kind: 'signup_grant' });
      return created;
    });
    user = (await User.findById(user._id))!;
  }
  res.json({ tokens: issueTokens(user), me: toMe(user), isNew });
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
