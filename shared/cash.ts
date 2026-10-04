// Cash challenges: everyone pays the same entry, and the pool is redivided by who hit their goal.
// All amounts are integer pesewas (GH₵1 = 100).

export const CASH = {
  /** The most a player can lose: someone who misses their goal still gets 40% of their entry back. */
  maxLossPct: 60,
  /** StepPool's cut, as a share of the whole pool, but never more than what the missers forfeited. */
  rakePct: 10,
  /** Entry fees offered when creating a challenge. */
  entryOptions: [1000, 2000, 5000, 10000],
  minWithdraw: 500,
} as const;

export const MOMO_NETWORKS = { MTN: 'MTN MoMo', VOD: 'Telecel Cash', ATL: 'AirtelTigo Money' } as const;
export type MomoNetwork = keyof typeof MOMO_NETWORKS;

export const ghs = (pesewas: number) => `GH₵${(pesewas / 100).toLocaleString('en-GH', { minimumFractionDigits: pesewas % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export interface CashSplit {
  /** What each player who hit their goal gets back (their entry plus a share of the forfeits). */
  winnerGets: number;
  /** What each player who missed gets back. */
  loserGets: number;
  rake: number;
  /** Pesewas that don't divide evenly between winners; kept by the house. */
  remainder: number;
}

/**
 * The settlement rule. If nobody, or everybody, hits their goal, nothing was forfeited, so everyone
 * is refunded in full and StepPool takes nothing. Otherwise missers forfeit up to 60% of their entry;
 * StepPool takes its cut from those forfeits, and the rest goes to the winners. A winner therefore
 * never gets back less than they paid.
 */
export function splitCash(entry: number, players: number, winners: number): CashSplit {
  if (winners <= 0 || winners >= players) return { winnerGets: entry, loserGets: entry, rake: 0, remainder: 0 };
  const losers = players - winners;
  const forfeitEach = Math.floor((entry * CASH.maxLossPct) / 100);
  const forfeited = losers * forfeitEach;
  const rake = Math.min(Math.floor((entry * players * CASH.rakePct) / 100), forfeited);
  const bonus = forfeited - rake;
  const per = Math.floor(bonus / winners);
  return { winnerGets: entry + per, loserGets: entry - forfeitEach, rake, remainder: bonus - per * winners };
}

/** Sponsors pay the prize plus StepPool's fee up front; the prize is held until winners claim it. */
export const SPONSOR = { feePct: 15, minPrizeGhs: 50, maxPrizeGhs: 100_000 } as const;

export const sponsorTotal = (prizeGhs: number, feePct: number = SPONSOR.feePct) => {
  const prize = Math.round(prizeGhs * 100);
  const fee = Math.round((prize * feePct) / 100);
  return { prize, fee, total: prize + fee };
};
