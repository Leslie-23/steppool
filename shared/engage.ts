// Reasons to come back between challenges: the standing weekly challenge, records and badges.
// Shared so the app shows exactly what the server awards.

/** The free public challenge StepPool opens every Monday, funded by the house. */
export const WEEKLY_WALK = { name: 'Weekly Walk', prizeCredits: 2000 } as const;

/** Evening nudge: only when today's target is this close, between these UTC hours (Accra is UTC+0). */
export const NUDGE = { maxStepsLeft: 2500, fromHour: 17, toHour: 20 } as const;

/** Icons are SF Symbol names that also exist in the Android icon mapping. */
export const BADGES = [
  { id: 'first_target', title: 'First Target', body: 'Hit your daily target for the first time.', icon: 'bolt.fill' },
  { id: 'day_10k', title: '10K Day', body: 'Walked 10,000 steps in a day.', icon: 'figure.walk' },
  { id: 'day_20k', title: '20K Day', body: 'Walked 20,000 steps in a day.', icon: 'sparkles' },
  { id: 'streak_3', title: '3-Day Streak', body: 'On target three days in a row.', icon: 'flame.fill' },
  { id: 'streak_7', title: 'Week Streak', body: 'On target seven days in a row.', icon: 'flame.fill' },
  { id: 'streak_30', title: 'Month Streak', body: 'On target thirty days in a row.', icon: 'crown.fill' },
  { id: 'first_challenge', title: 'In the Pool', body: 'Joined your first challenge.', icon: 'person.2.fill' },
  { id: 'first_win', title: 'First Win', body: 'Hit your goal in a challenge.', icon: 'trophy.fill' },
  { id: 'wins_5', title: 'Five Wins', body: 'Hit your goal in five challenges.', icon: 'trophy.fill' },
  { id: 'record_breaker', title: 'Record Breaker', body: 'Beat your own best day.', icon: 'chart.line.uptrend.xyaxis' },
] as const;
export type BadgeId = (typeof BADGES)[number]['id'];
export const badgeById = (id: string) => BADGES.find((b) => b.id === id);
