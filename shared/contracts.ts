// Wire contracts shared by the Expo app and the Node server.
// The server never trusts a step total from a client: only raw samples cross the wire.
import { z } from 'zod';

export const RecordingMethod = z.enum(['automatic', 'active', 'manual', 'unknown']);
export type RecordingMethod = z.infer<typeof RecordingMethod>;

export const StepSample = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  count: z.number().int().nonnegative().max(100_000),
  /** iOS bundle id of the writer app, or Android package name (dataOrigin). */
  source: z.string().min(1).max(200),
  /** Platform-native id of the sample, used for idempotent re-uploads. */
  nativeId: z.string().min(1).max(200),
  recordingMethod: RecordingMethod,
  device: z
    .object({ model: z.string().max(100).optional(), kind: z.enum(['phone', 'watch', 'band', 'other']).optional() })
    .optional(),
});
export type StepSample = z.infer<typeof StepSample>;

export const IngestBody = z.object({
  platform: z.enum(['ios', 'android']),
  samples: z.array(StepSample).max(5000),
});
export type IngestBody = z.infer<typeof IngestBody>;

export const ChallengeKind = z.enum(['credits', 'sponsored', 'cash']);
export type ChallengeKind = z.infer<typeof ChallengeKind>;

export const CreateChallengeBody = z.object({
  name: z.string().trim().min(3).max(48),
  durationHours: z.union([z.literal(48), z.literal(168), z.literal(720)]),
  entryCredits: z.number().int().min(0).max(1000),
  visibility: z.enum(['public', 'private']),
  startsAt: z.string().datetime().optional(),
  /** Stretch applied to every player's own usual pace (1.15 = +15%). */
  goalMultiplier: z.number().min(0.8).max(2).optional(),
});
export type CreateChallengeBody = z.infer<typeof CreateChallengeBody>;

/** A real-money challenge. Behind the PAID_ENTRY_ENABLED flag. */
export const CreateCashChallengeBody = CreateChallengeBody.omit({ entryCredits: true }).extend({
  entryPesewas: z.union([z.literal(1000), z.literal(2000), z.literal(5000), z.literal(10000)]),
});
export type CreateCashChallengeBody = z.infer<typeof CreateCashChallengeBody>;

export const SponsorChallengeBody = CreateChallengeBody.extend({
  sponsor: z.object({
    name: z.string().min(1).max(60),
    logoUrl: z.string().url().optional(),
    prizeDescription: z.string().min(1).max(120),
    prizeValueGhs: z.number().nonnegative(),
    maxWinners: z.number().int().positive().optional(),
  }),
});
export type SponsorChallengeBody = z.infer<typeof SponsorChallengeBody>;

/** A brand paying for a sponsored challenge from the website. */
export const SponsorCheckoutBody = z.object({
  company: z.string().trim().min(2, 'Enter your company name').max(60, 'Company name is too long'),
  email: z.string().trim().email('Enter a valid billing email'),
  phone: z.string().trim().regex(/^\+?\d{7,15}$/, 'Enter a valid phone number').optional(),
  /** Only logos uploaded through POST /sponsor/logo are accepted (checked in the route). */
  logoUrl: z.string().url('Upload your logo as an image').optional(),
  challengeName: z.string().trim().min(3, 'Challenge name needs at least 3 characters').max(48, 'Challenge name is too long'),
  /** Optional non-cash add-on shown after the amount, e.g. "branded merch". The amount itself is never typed. */
  prizeExtra: z.string().trim().max(60, 'Keep the extra prize under 60 characters').optional(),
  prizeValueGhs: z.number('Enter the prize amount').int('Prize must be a whole number of cedis').min(50, 'Prize must be at least GH₵50').max(100_000, 'Prize can be at most GH₵100,000'),
  maxWinners: z.number().int('Max winners must be a whole number').positive('Max winners must be at least 1').max(10_000, 'Max winners can be at most 10,000').optional(),
  durationHours: z.union([z.literal(48), z.literal(168), z.literal(720)], 'Pick a duration'),
  startsAt: z.string().datetime('Pick a valid start time').optional(),
});
export type SponsorCheckoutBody = z.infer<typeof SponsorCheckoutBody>;

export type ChallengeStatus = 'upcoming' | 'live' | 'settling' | 'settled';

export interface Sponsor {
  name: string;
  logoUrl?: string;
  prizeDescription: string;
  prizeValueGhs: number;
  maxWinners?: number;
}

export interface ChallengeSummary {
  id: string;
  name: string;
  kind: ChallengeKind;
  status: ChallengeStatus;
  visibility: 'public' | 'private';
  inviteCode: string;
  entryCredits: number;
  /** Cash challenges: entry fee in pesewas. */
  entryPesewas?: number;
  goalMultiplier: number;
  /** The pool, in the challenge's own unit: credits, or pesewas for cash challenges. */
  poolCredits: number;
  players: number;
  startsAt: string;
  endsAt: string;
  sponsor?: Sponsor;
  /** The standing weekly challenge StepPool runs itself. */
  house?: boolean;
  /** Present when the caller has joined. */
  me?: { goal: number; steps: number; rank: number; goalHitAt?: string };
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  avatar?: string;
  steps: number;
  goal: number;
  rank: number;
  goalHit: boolean;
}

export interface ChallengeResults {
  challenge: ChallengeSummary;
  finishers: number;
  /** What each finisher received: credits, or pesewas for cash challenges. */
  perFinisher?: number;
  /** Cash challenges: what each player who missed got back, in pesewas. */
  perMisser?: number;
  top: LeaderboardRow[];
  /** Friend challenges can be run again with the same group. */
  canRematch?: boolean;
  /** A rematch someone already started that is still open to join. */
  rematch?: { id: string; name: string; players: number; joined: boolean };
  me?: { steps: number; rank: number; goal: number; goalHit: boolean; wonCredits?: number; wonPesewas?: number; prize?: string; payoutId?: string; flagged?: boolean };
}

/** All-time personal records. Dates are ISO strings; `bestWeek` is the Monday the week started. */
export interface Records {
  bestDay: { day: string; steps: number } | null;
  bestWeek: { week: string; steps: number } | null;
  longestStreak: number;
}

export interface Analytics {
  /** Last 30 UTC days, oldest first. */
  days: { day: string; steps: number }[];
  /** Average verified steps per UTC hour of day (0–23) over the last 30 days. */
  hourly: number[];
  dailyTarget: number;
  baselineDaily: number;
  thisWeek: number;
  lastWeek: number;
  bestDay: { day: string; steps: number } | null;
  activeDays: number;
  /** Consecutive full days on target, ending yesterday. */
  streak: number;
  longestStreak: number;
  challenges: { joined: number; finished: number; live: number; creditsWon: number; prizesWon: number };
  /** All-time records; absent until the first sync after they were introduced. */
  records?: Records;
  /** Badges earned so far (ids from shared/engage BADGES). */
  badges?: { id: string; at: string }[];
}

export type NotificationKind = 'goal' | 'overtake' | 'reminder' | 'results' | 'joins' | 'announcement';
export type NotificationPrefs = Record<NotificationKind, boolean>;

export interface InboxItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  challengeId?: string;
  /** A screen to open instead of a challenge, e.g. "analytics". */
  screen?: string;
  read: boolean;
  at: string;
}

export interface Me {
  id: string;
  email: string;
  phone?: string;
  name: string;
  avatar?: string;
  baselineDaily: number;
  credits: number;
  notifPrefs: NotificationPrefs;
  /** The daily target in effect: the user's own if set, otherwise derived from their usual pace. */
  dailyTarget: number;
  dailyTargetCustom: boolean;
  referralCode: string;
  /** True while a new account can still enter someone's referral code. */
  canRedeemReferral: boolean;
  role: 'user' | 'admin';
  /** Which sign-in methods are linked. */
  providers: ('email' | 'apple' | 'google')[];
  /** Real-money challenges are available to this user (feature flag, or a tester). */
  cashEnabled: boolean;
  /** Withdrawable cash balance in pesewas. */
  cashPesewas: number;
}

export interface CashLine {
  id: string;
  amount: number;
  kind: LedgerKind;
  challengeName?: string;
  at: string;
}

export interface Withdrawal {
  id: string;
  amount: number;
  network: string;
  momoNumber: string;
  status: 'pending' | 'success' | 'failed';
  reason?: string;
  at: string;
}

export interface CashWallet {
  enabled: boolean;
  balance: number;
  lines: CashLine[];
  withdrawals: Withdrawal[];
  momo?: { number: string; network: string };
}

/** Joining a cash challenge either completes from the wallet or needs a Paystack payment first. */
export type CashJoin = { joined: ChallengeSummary } | { checkoutUrl: string; reference: string; amount: number };

export type LedgerKind =
  | 'signup_grant'
  | 'entry'
  | 'payout'
  | 'refund'
  | 'house_remainder'
  | 'walk_reward'
  | 'streak_bonus'
  | 'weekly_topup'
  | 'referral'
  | 'admin_grant'
  | 'deposit'
  | 'rake'
  | 'withdrawal'
  | 'withdrawal_reversal'
  | 'sponsor_fund'
  | 'sponsor_fee'
  | 'prize_payout'
  | 'prize_payout_reversal'
  | 'prize_fund';

export interface LedgerLine {
  id: string;
  amount: number;
  kind: LedgerKind;
  note?: string;
  challengeName?: string;
  at: string;
}

export interface Payout {
  id: string;
  challengeId: string;
  challengeName: string;
  kind: 'credits' | 'sponsor_prize';
  amount?: number;
  prizeDescription?: string;
  status: 'pending' | 'claimed' | 'fulfilled';
}

/** Socket.IO events. Rooms are `challenge:<id>`. */
export interface ServerToClient {
  'leaderboard:delta': (p: { challengeId: string; rows: LeaderboardRow[]; pool: number; players: number }) => void;
  'goal:hit': (p: { challengeId: string; userId: string; name: string }) => void;
  'challenge:settled': (p: { challengeId: string }) => void;
}
export interface ClientToServer {
  'challenge:watch': (challengeId: string) => void;
  'challenge:unwatch': (challengeId: string) => void;
}

export const SIGNUP_CREDITS = 1000;
/** Invite codes: 6 characters, no look-alikes (0/O, 1/I). */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;
export const DAY_MS = 86_400_000;
