import type { ChallengeSummary, LeaderboardRow, Me } from '../../shared/contracts.js';

import type { ChallengeDoc, ParticipantDoc, UserDoc } from './models.js';

export function toMe(u: UserDoc): Me {
  const p = u.notifPrefs;
  return {
    id: String(u._id),
    email: u.email,
    phone: u.phone ?? undefined,
    name: u.name ?? '',
    avatar: u.avatar ?? undefined,
    baselineDaily: u.baselineDaily ?? 0,
    credits: u.credits ?? 0,
    notifPrefs: { goal: p?.goal ?? true, overtake: p?.overtake ?? true, reminder: p?.reminder ?? true, results: p?.results ?? true, joins: p?.joins ?? true },
    providers: ['email' as const, ...(u.appleSub ? (['apple'] as const) : []), ...(u.googleSub ? (['google'] as const) : [])],
  };
}

export function toSummary(c: ChallengeDoc, poolCredits: number, me?: { p: ParticipantDoc; rank: number }): ChallengeSummary {
  return {
    id: String(c._id),
    name: c.name,
    kind: c.kind as ChallengeSummary['kind'],
    status: c.status as ChallengeSummary['status'],
    visibility: c.visibility as ChallengeSummary['visibility'],
    inviteCode: c.inviteCode,
    entryCredits: c.entryCredits ?? 0,
    goalMultiplier: c.goalMultiplier ?? 1.15,
    poolCredits,
    players: c.players ?? 0,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    sponsor: c.sponsor?.name
      ? {
          name: c.sponsor.name,
          logoUrl: c.sponsor.logoUrl ?? undefined,
          prizeDescription: c.sponsor.prizeDescription ?? '',
          prizeValueGhs: c.sponsor.prizeValueGhs ?? 0,
          maxWinners: c.sponsor.maxWinners ?? undefined,
        }
      : undefined,
    me: me ? { goal: me.p.goal, steps: me.p.steps ?? 0, rank: me.rank, goalHitAt: me.p.goalHitAt?.toISOString() } : undefined,
  };
}

/** Competition ranking (1, 2, 2, 4) over rows already sorted by steps desc. */
export function toRows(ps: ParticipantDoc[]): LeaderboardRow[] {
  let rank = 0;
  let prev = Number.POSITIVE_INFINITY;
  return ps.map((p, i) => {
    const steps = p.steps ?? 0;
    if (steps < prev) {
      rank = i + 1;
      prev = steps;
    }
    return { userId: String(p.userId), name: p.name, steps, goal: p.goal, rank, goalHit: !!p.goalHitAt };
  });
}
