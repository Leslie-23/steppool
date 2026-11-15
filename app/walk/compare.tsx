import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, Pill, Row, Screen, T } from '@/components/ds/primitives';
import { BackBar } from '@/components/walk/bits';
import { WalkMap } from '@/components/walk/WalkMap';
import { useWalks } from '@/lib/walk/store';
import type { SavedWalk } from '@/lib/walk/types';
import { boundsOf, fmtDuration, fmtKm, fmtPace, fmtSpeed, sameRoute } from '@/shared/walk';
import { color, space, type } from '@/theme/tokens';

const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Two walks side by side: both lines on one map, the numbers against each other, and kilometre by kilometre. */
export default function CompareWalks() {
  const { a: idA, b: idB } = useLocalSearchParams<{ a: string; b: string }>();
  const get = useWalks((s) => s.get);
  const [pair, setPair] = useState<[SavedWalk, SavedWalk] | null>(null);

  useEffect(() => {
    const [x, y] = [get(idA), get(idB)];
    // Earlier walk first, so "change" reads as progress over time.
    if (x && y) setPair(x.startedAt <= y.startedAt ? [x, y] : [y, x]);
  }, [idA, idB, get]);

  const same = useMemo(() => (pair ? sameRoute(pair[0].points, pair[1].points, pair[0].distance, pair[1].distance) : false), [pair]);
  const bounds = useMemo(() => (pair ? boundsOf([...pair[0].points, ...pair[1].points]) : null), [pair]);
  if (!pair) return <Screen><BackBar onBack={() => router.back()} /></Screen>;
  const [a, b] = pair;

  const rows: { label: string; a: string; b: string; better?: 'a' | 'b' | null }[] = [
    { label: 'Distance', a: `${fmtKm(a.distance)} km`, b: `${fmtKm(b.distance)} km`, better: a.distance === b.distance ? null : a.distance > b.distance ? 'a' : 'b' },
    { label: 'Moving time', a: fmtDuration(a.movingMs), b: fmtDuration(b.movingMs), better: same ? (a.movingMs === b.movingMs ? null : a.movingMs < b.movingMs ? 'a' : 'b') : null },
    { label: 'Avg pace', a: `${fmtPace(a.stats.pace)} /km`, b: `${fmtPace(b.stats.pace)} /km`, better: a.stats.pace && b.stats.pace && a.stats.pace !== b.stats.pace ? (a.stats.pace < b.stats.pace ? 'a' : 'b') : null },
    { label: 'Avg speed', a: `${fmtSpeed(a.stats.avgSpeed)} km/h`, b: `${fmtSpeed(b.stats.avgSpeed)} km/h` },
    { label: 'Steps', a: a.stats.steps ? a.stats.steps.toLocaleString() : '—', b: b.stats.steps ? b.stats.steps.toLocaleString() : '—' },
    { label: 'Cadence', a: a.stats.cadence ? `${a.stats.cadence} spm` : '—', b: b.stats.cadence ? `${b.stats.cadence} spm` : '—' },
    { label: 'Climb', a: `${a.stats.gain} m`, b: `${b.stats.gain} m` },
  ];
  const kms = Math.min(a.splits.length, b.splits.length);
  const gap = b.movingMs - a.movingMs;

  return (
    <Screen>
      <BackBar onBack={() => router.back()} title="Compare" />
      <ScrollView contentContainerStyle={{ gap: space.xl, paddingBottom: space.xxxl, paddingTop: space.md }} showsVerticalScrollIndicator={false}>
        <WalkMap style={styles.map} route={a.points.map((p) => [p.lng, p.lat])} second={b.points.map((p) => [p.lng, p.lat])} camera={bounds ? { kind: 'bounds', bounds } : { kind: 'free' }} />
        <Row gap={space.lg} style={{ flexWrap: 'wrap' }}>
          <Row gap={6}><View style={[styles.key, { backgroundColor: color.volt }]} /><T v="caption">{a.name} · {day(a.startedAt)}</T></Row>
          <Row gap={6}><View style={[styles.key, { backgroundColor: color.gold }]} /><T v="caption">{b.name} · {day(b.startedAt)}</T></Row>
        </Row>

        {same ? (
          <Card tone="volt" style={{ gap: 4 }}>
            <Pill label="Same route" tone="volt" />
            <T v="heading" style={{ fontSize: 18, marginTop: space.sm }}>
              {gap === 0 ? 'Dead level.' : `${day(b.startedAt)} was ${fmtDuration(Math.abs(gap))} ${gap < 0 ? 'faster' : 'slower'}.`}
            </T>
            <T v="caption">Both walks cover the same ground, so the times compare directly.</T>
          </Card>
        ) : (
          <T v="caption">These walks took different routes, so compare pace rather than time.</T>
        )}

        <Card style={{ gap: 0 }}>
          {rows.map((r, i) => (
            <Row key={r.label} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <T style={[type.num, styles.cell, { textAlign: 'left', color: r.better === 'a' ? color.volt : color.text }]}>{r.a}</T>
              <T v="label" style={{ fontSize: 10, flex: 1, textAlign: 'center' }}>{r.label}</T>
              <T style={[type.num, styles.cell, { textAlign: 'right', color: r.better === 'b' ? color.gold : color.text }]}>{r.b}</T>
            </Row>
          ))}
        </Card>

        {kms ? (
          <View style={{ gap: space.sm }}>
            <T v="label">Kilometre by kilometre</T>
            {Array.from({ length: kms }, (_, i) => {
              const d = b.splits[i].ms - a.splits[i].ms;
              return (
                <Row key={i} style={styles.row}>
                  <T style={[type.num, styles.cell, { textAlign: 'left' }]}>{fmtDuration(a.splits[i].ms)}</T>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <T v="label" style={{ fontSize: 10 }}>KM {i + 1}</T>
                    <T v="caption" style={{ fontSize: 11, color: d < 0 ? color.gold : d > 0 ? color.volt : color.muted }}>{d === 0 ? 'level' : `${fmtDuration(Math.abs(d))} ${d < 0 ? 'quicker →' : '← quicker'}`}</T>
                  </View>
                  <T style={[type.num, styles.cell, { textAlign: 'right' }]}>{fmtDuration(b.splits[i].ms)}</T>
                </Row>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: 24 },
  key: { width: 14, height: 4, borderRadius: 2 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  cell: { fontSize: 15, width: 104 },
});
