import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { apiCache } from './cache';

/**
 * Minimal fetch hook: loads on focus, keeps the last good value while refreshing,
 * and exposes `mutate` for optimistic/socket updates.
 * With `cacheKey`, the last response is shared across screens and shown instantly on the next visit.
 */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = [], cacheKey?: string) {
  const [data, setDataState] = useState<T | undefined>(() => (cacheKey ? apiCache.get<T>(cacheKey) : undefined));
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  const setData = useCallback((next: T | undefined | ((cur: T | undefined) => T | undefined)) => {
    setDataState((cur) => {
      const value = typeof next === 'function' ? (next as (c: T | undefined) => T | undefined)(cur) : next;
      if (keyRef.current && value !== undefined) apiCache.set(keyRef.current, value);
      return value;
    });
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setRefreshing(false);
    }
  }, [setData]);

  useFocusEffect(
    useCallback(() => {
      // A different key (e.g. another challenge) starts from its own cache, not the previous screen's data.
      if (keyRef.current) setDataState(apiCache.get<T>(keyRef.current));
      refresh();
    }, [refresh, cacheKey, ...deps]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** First load with nothing to show yet: render a skeleton. */
  const loading = data === undefined && !error;
  return { data, error, refreshing, loading, refresh, mutate: setData };
}
