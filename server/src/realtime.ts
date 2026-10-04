import type { Types } from 'mongoose';

import type { ServerToClient } from '../../shared/contracts.js';

import { account, balanceOf, cash } from './ledger.js';
import { Challenge, Participant, type ParticipantDoc } from './models.js';
import { redis } from './redis.js';
import { toRows } from './views.js';

/** Anything that can emit to a room: the Socket.IO server in the API, a Redis emitter in the worker. */
export interface Broadcaster {
  to(room: string): { emit<E extends keyof ServerToClient>(event: E, ...args: Parameters<ServerToClient[E]>): unknown };
}

let broadcaster: Broadcaster | null = null;
export const setBroadcaster = (b: Broadcaster) => (broadcaster = b);
export const room = (challengeId: string) => `challenge:${challengeId}`;

export function emit<E extends keyof ServerToClient>(challengeId: string, event: E, ...args: Parameters<ServerToClient[E]>) {
  broadcaster?.to(room(challengeId)).emit(event, ...args);
}

const LB_LIMIT = 100;
const lbKey = (cid: string) => `lb:${cid}`;

export async function setScore(challengeId: string, userId: string, steps: number) {
  await redis().zadd(lbKey(challengeId), steps, userId);
}

/** 1-based competition rank from the sorted set: everyone with strictly more steps, plus one. */
export async function rankOf(challengeId: string, steps: number) {
  return (await redis().zcount(lbKey(challengeId), `(${steps}`, '+inf')) + 1;
}

export async function topRows(challengeId: string | Types.ObjectId) {
  const ps = await Participant.find({ challengeId, status: { $ne: 'disqualified' } })
    .sort({ steps: -1, goalHitAt: 1, createdAt: 1 })
    .limit(LB_LIMIT)
    .lean<ParticipantDoc[]>();
  return toRows(ps);
}

// Leaderboard pushes are coalesced: ingest marks a room dirty, a 1s ticker sends one update per room.
const dirty = new Set<string>();
export const markDirty = (challengeId: string) => dirty.add(challengeId);

export function startLeaderboardTicker(intervalMs = 1000) {
  const tick = async () => {
    const ids = [...dirty];
    dirty.clear();
    await Promise.all(
      ids.map(async (id) => {
        const c = await Challenge.findById(id, { players: 1, kind: 1 }).lean();
        const [rows, pool] = await Promise.all([topRows(id), balanceOf(c?.kind === 'cash' ? cash.pool(id) : account.pool(id))]);
        emit(id, 'leaderboard:delta', { challengeId: id, rows, pool, players: c?.players ?? rows.length });
      }),
    ).catch((e) => console.error('leaderboard tick', e));
  };
  const handle = setInterval(tick, intervalMs);
  return () => clearInterval(handle);
}
