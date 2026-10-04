/**
 * In-memory cache of the last good API responses, keyed by what they are ("today", "challenges", ...).
 * Screens render from it instantly when revisited, then refresh quietly. Cleared on sign-out so one
 * account never sees another's data.
 */
const store = new Map<string, unknown>();

export const apiCache = {
  get: <T>(key: string) => store.get(key) as T | undefined,
  set: (key: string, value: unknown) => store.set(key, value),
  clear: () => store.clear(),
};
