import { useEffect, useState } from 'react';
import { Text, type TextStyle } from 'react-native';

import { type } from '@/theme/tokens';

export function formatLeft(ms: number) {
  if (ms <= 0) return 'Ended';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Countdown({ to, style }: { to: string; style?: TextStyle }) {
  const now = useNow();
  return <Text allowFontScaling={false} style={[type.num, { fontSize: 15 }, style]}>{formatLeft(new Date(to).getTime() - now)}</Text>;
}
