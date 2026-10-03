import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * Minimal fetch hook: loads on focus, keeps the last good value while refreshing,
 * and exposes `mutate` for optimistic/socket updates.
 */
export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;

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
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh, ...deps]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { data, error, refreshing, refresh, mutate: setData };
}
