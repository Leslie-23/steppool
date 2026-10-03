import type {
  Analytics,
  InboxItem,
  NotificationPrefs,
  ChallengeResults,
  ChallengeSummary,
  CreateChallengeBody,
  IngestBody,
  LeaderboardRow,
  LedgerLine,
  Me,
  Payout,
} from '@/shared/contracts';

import { useSession } from './session';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const tokens = useSession.getState().tokens;
  if (!tokens) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh: tokens.refresh }),
  });
  if (!res.ok) {
    await useSession.getState().signOut();
    return false;
  }
  await useSession.getState().setTokens(await res.json());
  return true;
}

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const access = useSession.getState().tokens?.access;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(access ? { authorization: `Bearer ${access}` } : null) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && access && !retried) {
    refreshing ??= refresh().finally(() => (refreshing = null));
    if (await refreshing) return request<T>(method, path, body, true);
  }
  if (!res.ok) {
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => undefined);
    throw new ApiError(res.status, msg ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

type Tokens = { access: string; refresh: string };

export const api = {
  requestOtp: (email: string) => request<{ devCode?: string }>('POST', '/auth/otp', { email }),
  verifyOtp: (email: string, code: string) => request<{ tokens: Tokens; me: Me; isNew: boolean }>('POST', '/auth/verify', { email, code }),
  appleSignIn: (identityToken: string, name?: string) => request<{ tokens: Tokens; me: Me; isNew: boolean }>('POST', '/auth/apple', { identityToken, name }),
  googleSignIn: (idToken: string) => request<{ tokens: Tokens; me: Me; isNew: boolean }>('POST', '/auth/google', { idToken }),
  notifications: () => request<{ items: InboxItem[]; unread: number }>('GET', '/notifications'),
  markRead: (ids?: string[]) => request<{ unread: number }>('POST', '/notifications/read', { ids }),
  updatePrefs: (notifPrefs: Partial<NotificationPrefs>) => request<Me>('PATCH', '/me', { notifPrefs }),
  me: () => request<Me>('GET', '/me'),
  updateMe: (patch: { name?: string; avatar?: string; pushToken?: string }) => request<Me>('PATCH', '/me', patch),
  ingest: (body: IngestBody) => request<{ accepted: number; todaySteps: number }>('POST', '/steps/ingest', body),
  analytics: () => request<Analytics>('GET', '/steps/analytics'),
  today: () => request<{ steps: number; baselineDaily: number; week: { day: string; steps: number }[] }>('GET', '/steps/today'),
  challenges: () => request<{ featured: ChallengeSummary[]; open: ChallengeSummary[]; mine: ChallengeSummary[] }>('GET', '/challenges'),
  challenge: (id: string) => request<ChallengeSummary>('GET', `/challenges/${id}`),
  byCode: (code: string) => request<ChallengeSummary>('GET', `/challenges/code/${encodeURIComponent(code)}`),
  results: (id: string) => request<ChallengeResults>('GET', `/challenges/${id}/results`),
  leaderboard: (id: string) => request<LeaderboardRow[]>('GET', `/challenges/${id}/leaderboard`),
  create: (body: CreateChallengeBody) => request<ChallengeSummary>('POST', '/challenges', body),
  join: (id: string) => request<ChallengeSummary>('POST', `/challenges/${id}/join`),
  wallet: () => request<{ balance: number; lines: LedgerLine[]; payouts: Payout[] }>('GET', '/wallet'),
  claim: (payoutId: string, details: { momoNumber: string; network: 'mtn' | 'telecel' | 'airteltigo' }) =>
    request<Payout>('POST', `/payouts/${payoutId}/claim`, details),
};
