import { View } from 'react-native';

import { Card, Row, T } from '@/components/ds/primitives';
import { CASH, ghs, splitCash } from '@/shared/cash';
import { color, space, type } from '@/theme/tokens';

/**
 * The deal, in money, before anyone pays: what you get back if you hit your goal and if you don't.
 * Uses a worked example (half the players hitting) because the real split depends on how many finish.
 */
export function CashRules({ entry, players }: { entry: number; players: number }) {
  const n = Math.max(players, 10);
  const half = splitCash(entry, n, Math.round(n / 2));
  const floor = entry - Math.floor((entry * CASH.maxLossPct) / 100);
  return (
    <Card tone="gold" style={{ gap: space.md }}>
      <T v="label">How the money splits</T>
      <Row gap={space.md}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="caption">Hit your goal</T>
          <T style={[type.num, { fontSize: 22, color: color.gold }]}>{ghs(half.winnerGets)}</T>
          <T v="caption" style={{ fontSize: 11 }}>back, if half of {n} make it</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="caption">Miss it</T>
          <T style={[type.num, { fontSize: 22 }]}>{ghs(floor)}</T>
          <T v="caption" style={{ fontSize: 11 }}>back, at least</T>
        </View>
      </Row>
      <T v="caption">
        Entry {ghs(entry)}. Miss your goal and you lose at most {CASH.maxLossPct}%. StepPool keeps {CASH.rakePct}% of the pool from what was lost, and the rest goes to everyone who made it. If nobody, or everybody, makes it, everyone gets their full entry back.
      </T>
    </Card>
  );
}
