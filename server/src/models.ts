import mongoose, { Schema, type InferSchemaType, type Types } from 'mongoose';

const opts = { timestamps: true, versionKey: false } as const;

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** MoMo number, captured when a prize is claimed. */
    phone: String,
    name: { type: String, default: '' },
    avatar: String,
    baselineDaily: { type: Number, default: 0 },
    /**
     * Transactional cache of the ledger balance, written in the same transaction as the ledger lines
     * so concurrent spends serialise on this document. The ledger is the source of truth.
     */
    credits: { type: Number, default: 0 },
    pushToken: String,
    tokenVersion: { type: Number, default: 0 },
    trustScore: { type: Number, default: 1 },
  },
  opts,
);

const ChallengeSchema = new Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ['credits', 'sponsored'], required: true },
    visibility: { type: String, enum: ['public', 'private'], required: true },
    status: { type: String, enum: ['upcoming', 'live', 'settling', 'settled'], default: 'upcoming', index: true },
    inviteCode: { type: String, required: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    entryCredits: { type: Number, default: 0 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    /** Late health data is accepted until here; then the challenge is settled. */
    syncCutoffAt: { type: Date, required: true, index: true },
    goalMultiplier: { type: Number, default: 1.15 },
    players: { type: Number, default: 0 },
    sponsor: {
      name: String,
      logoUrl: String,
      prizeDescription: String,
      prizeValueGhs: Number,
      maxWinners: Number,
    },
    finishers: Number,
    perFinisher: Number,
    lastHourPushed: { type: Boolean, default: false },
  },
  opts,
);

const ParticipantSchema = new Schema(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    goal: { type: Number, required: true },
    steps: { type: Number, default: 0 },
    heldSteps: { type: Number, default: 0 },
    goalHitAt: Date,
    status: { type: String, enum: ['active', 'finished', 'missed', 'disqualified'], default: 'active' },
    wonCredits: Number,
  },
  opts,
);
ParticipantSchema.index({ challengeId: 1, userId: 1 }, { unique: true });
ParticipantSchema.index({ challengeId: 1, steps: -1 });
ParticipantSchema.index({ userId: 1 });

/** Raw samples exactly as uploaded. Idempotent on (userId, nativeId). */
const StepSampleSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    nativeId: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    count: { type: Number, required: true },
    source: { type: String, required: true },
    recordingMethod: String,
    deviceKind: String,
    /** Never counted: manual entry, untrusted writer app, impossible cadence. */
    rejected: String,
    /** Counted only after review: e.g. a large late backfill. */
    held: String,
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);
StepSampleSchema.index({ userId: 1, nativeId: 1 }, { unique: true });
StepSampleSchema.index({ userId: 1, start: 1, end: 1 });

/** Verified steps per user per UTC hour. Everything downstream (goals, leaderboards, baselines) sums these. */
const HourBucketSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    hour: { type: Date, required: true },
    counted: { type: Number, default: 0 },
    held: { type: Number, default: 0 },
    flags: [String],
    /** Per-source totals (array, because bundle ids contain dots, which Mongo map keys can't). */
    bySource: [{ _id: false, source: String, count: Number }],
  },
  { versionKey: false },
);
HourBucketSchema.index({ userId: 1, hour: 1 }, { unique: true });

/**
 * Append-only double-entry ledger. Every transfer writes a debit and a credit sharing `txId`,
 * so the sum over all lines is always zero.
 */
const LedgerSchema = new Schema(
  {
    txId: { type: String, required: true, index: true },
    account: { type: String, required: true, index: true }, // user:<id> | pool:<challengeId> | house | mint
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['CREDIT', 'GHS'], default: 'CREDIT' },
    kind: { type: String, enum: ['signup_grant', 'entry', 'payout', 'refund', 'house_remainder'], required: true },
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

const PayoutSchema = new Schema(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['credits', 'sponsor_prize'], required: true },
    amount: Number,
    prizeDescription: String,
    status: { type: String, enum: ['pending', 'claimed', 'fulfilled'], default: 'pending' },
    claim: { momoNumber: String, network: String, at: Date },
  },
  opts,
);
PayoutSchema.index({ challengeId: 1, userId: 1, kind: 1 }, { unique: true });

export const User = mongoose.model('User', UserSchema);
export const Challenge = mongoose.model('Challenge', ChallengeSchema);
export const Participant = mongoose.model('Participant', ParticipantSchema);
export const StepSampleModel = mongoose.model('StepSample', StepSampleSchema);
export const HourBucket = mongoose.model('HourBucket', HourBucketSchema);
export const Ledger = mongoose.model('Ledger', LedgerSchema);
export const Payout = mongoose.model('Payout', PayoutSchema);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };
export type ChallengeDoc = InferSchemaType<typeof ChallengeSchema> & { _id: Types.ObjectId; createdAt: Date };
export type ParticipantDoc = InferSchemaType<typeof ParticipantSchema> & { _id: Types.ObjectId };

export async function connectDb(url: string) {
  await mongoose.connect(url);
  await Promise.all([User, Challenge, Participant, StepSampleModel, HourBucket, Ledger, Payout].map((m) => m.syncIndexes()));
}
