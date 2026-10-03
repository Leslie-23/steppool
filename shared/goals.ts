// Personal goals: everyone is measured against their own baseline, so a desk worker
// and a market trader both have a real shot. Shared so the app previews exactly what the server freezes.

export const DEFAULT_BASELINE = 6000;
export const MIN_DAILY = 5000;
export const MAX_DAILY = 20000;
export const DEFAULT_MULTIPLIER = 1.15;

const round500 = (n: number) => Math.round(n / 500) * 500;

export function dailyTarget(baselineDaily: number, multiplier = DEFAULT_MULTIPLIER) {
  const base = baselineDaily > 0 ? baselineDaily : DEFAULT_BASELINE;
  return Math.min(MAX_DAILY, Math.max(MIN_DAILY, round500(base * multiplier)));
}

/** Whole-challenge goal, frozen at join time. */
export function challengeGoal(baselineDaily: number, durationHours: number, multiplier = DEFAULT_MULTIPLIER) {
  return round500(dailyTarget(baselineDaily, multiplier) * (durationHours / 24));
}

/** Median of the last N full days; robust to one huge day or a dead-battery day. */
export function baselineFrom(dailyTotals: number[]) {
  const days = dailyTotals.filter((n) => n > 300).sort((a, b) => a - b);
  if (days.length < 3) return 0;
  const mid = Math.floor(days.length / 2);
  return Math.round(days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2);
}
