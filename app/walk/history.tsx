import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/ds/Segmented';
import { Button, Card, Press, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BackBar, RouteThumb } from '@/components/walk/bits';
import { WalkMap } from '@/components/walk/WalkMap';
import { haptic } from '@/lib/haptics';
import { useWalks } from '@/lib/walk/store';
import type { WalkMeta } from '@/lib/walk/types';
import { boundsOf, fmtDuration, fmtKm, fmtPace } from '@/shared/walk';
import { color, space } from '@/theme/tokens';

const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** Every walk recorded on this phone: as a list, or all at once on a heatmap. */
export default function WalkHistory() {
  const { compare } = useLocalSearchParams<{ compare?: string }>();
  const { walks, load } = useWalks();
  const [view, setView] = useState<'list' | 'heat'>('list');
  // Picking a second walk to compare with the one we came from, or two from the list.
  const [picked, setPicked] = useState<string[]>(compare ? [compare] : []);
  const [comparing, setComparing] = useState(!!compare);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => ({ distance: walks.reduce((a, w) => a + w.distance, 0), time: walks.reduce((a, w) => a + w.movingMs, 0) }), [walks]);
  const heat = useMemo(() => walks.map((w) => w.line), [walks]);
  const heatBounds = useMemo(() => boundsOf(walks.flatMap((w) => w.line.map(([lng, lat]) => ({ lng, lat })))), [walks]);

  const tap = (w: WalkMeta) => {
    haptic.select();
    if (!comparing) return router.push(`/walk/${w.id}` as never);
    const next = picked.includes(w.id) ? picked.filter((x) => x !== w.id) : [...picked, w.id].slice(-2);
    setPicked(next);
    if (next.length === 2) router.push({ pathname: '/walk/compare', params: { a: next[0], b: next[1] } } as never);
  };

  return (
    <Screen>
      <BackBar
        onBack={() => router.back()}
        right={
          walks.length > 1 ? (
            <Press onPress={() => { setComparing((c) => !c); setPicked([]); }} accessibilityRole="button">
              <T v="caption" style={{ color: color.volt }}>{comparing ? 'Cancel' : 'Compare'}</T>
            </Press>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ gap: space.xl, paddingBottom: space.xxxl, paddingTop: space.md }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 4 }}>
          <T v="title">My walks</T>
          {walks.length ? <T v="caption">{walks.length} {walks.length === 1 ? 'walk' : 'walks'} · {fmtKm(totals.distance, 1)} km · {fmtDuration(totals.time)} moving</T> : null}
        </View>

        {!walks.length ? (
          <Card style={{ gap: space.md, alignItems: 'center', paddingVertical: space.xxl }}>
            <IconSymbol name="map.fill" size={30} color={color.faint} />
            <T v="heading" style={{ fontSize: 17 }}>No walks yet</T>
            <T v="caption" style={{ textAlign: 'center' }}>Record one and it appears here with its route, splits and a replay. Walks are kept on this phone only.</T>
            <Button label="Record a walk" onPress={() => router.replace('/walk' as never)} />
          </Card>
        ) : (
          <>
            <Segmented options={[{ label: 'List', value: 'list' }, { label: 'Heatmap', value: 'heat' }]} value={view} onChange={setView} />
            {view === 'heat' ? (
              <View style={{ gap: space.sm }}>
                <WalkMap style={styles.map} heat={heat} camera={heatBounds ? { kind: 'bounds', bounds: heatBounds } : { kind: 'free' }} />
                <T v="caption" style={{ fontSize: 12 }}>Everywhere you have walked. Brighter means more often.</T>
              </View>
            ) : (
              <View style={{ gap: space.md }}>
                {comparing ? <T v="caption" style={{ color: color.volt }}>{picked.length ? 'Pick the walk to compare it with.' : 'Pick two walks to compare.'}</T> : null}
                {walks.map((w) => {
                  const on = picked.includes(w.id);
                  return (
                    <Press key={w.id} onPress={() => tap(w)} accessibilityRole="button" accessibilityLabel={`${w.name}, ${day(w.startedAt)}, ${fmtKm(w.distance)} kilometres`}>
                      <Card tone={on ? 'volt' : undefined}>
                        <Row gap={space.md}>
                          <RouteThumb line={w.line} size={56} stroke={on ? color.volt : color.text} />
                          <View style={{ flex: 1 }}>
                            <Row style={{ justifyContent: 'space-between' }}>
                              <T v="heading" style={{ fontSize: 16, flex: 1 }} numberOfLines={1}>{w.name}</T>
                              <T v="caption" style={{ fontSize: 12 }}>{day(w.startedAt)}</T>
                            </Row>
                            <T v="caption">
                              {fmtKm(w.distance)} km · {fmtDuration(w.movingMs)} · {fmtPace(w.distance ? w.movingMs / 1000 / (w.distance / 1000) : null)} /km
                            </T>
                            {w.records?.length ? <T v="caption" style={{ color: color.gold, fontSize: 12 }}>{w.records.join(' · ')}</T> : null}
                          </View>
                          {comparing ? <IconSymbol name={on ? 'checkmark.circle.fill' : 'plus'} size={18} color={on ? color.volt : color.muted} /> : <IconSymbol name="chevron.right" size={16} color={color.muted} />}
                        </Row>
                      </Card>
                    </Press>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 420, borderRadius: 24 },
});
