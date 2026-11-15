import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { HoldButton } from '@/components/ds/HoldButton';
import { Segmented } from '@/components/ds/Segmented';
import { Button, Card, Pill, Row, Screen, T } from '@/components/ds/primitives';
import { WalkCard } from '@/components/share/ShareCards';
import { BackBar, ElevationChart, Legend, StatCell } from '@/components/walk/bits';
import { WalkMap } from '@/components/walk/WalkMap';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { shareCard } from '@/lib/share';
import { newId, useWalks } from '@/lib/walk/store';
import type { SavedWalk } from '@/lib/walk/types';
import { boundsOf, colourSegments, elevationProfile, fmtDuration, fmtKm, fmtPace, fmtSpeed, pointsInKm, type Overlay } from '@/shared/walk';
import { color, space, type } from '@/theme/tokens';

const OVERLAYS: { label: string; value: Overlay }[] = [
  { label: 'Route', value: 'plain' },
  { label: 'Pace', value: 'pace' },
  { label: 'Speed', value: 'speed' },
  { label: 'Height', value: 'elevation' },
  { label: 'Slope', value: 'gradient' },
];
const LEGEND: Record<Exclude<Overlay, 'plain'>, [string, string]> = { pace: ['Slower', 'Faster'], speed: ['Slower', 'Faster'], elevation: ['Lower', 'Higher'], gradient: ['Downhill', 'Uphill'] };

/** A finished walk: the route (coloured by what you choose), the numbers, splits and elevation. */
export default function WalkDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const name = useSession((s) => s.me?.name ?? '');
  const walks = useWalks((s) => s.walks);
  const { get, remove, saveRoute, load } = useWalks();
  const [walk, setWalk] = useState<SavedWalk | null | undefined>(undefined);
  const [overlay, setOverlay] = useState<Overlay>('plain');
  const [km, setKm] = useState<number | null>(null);
  const [savedRoute, setSavedRoute] = useState(false);
  const cardRef = useRef<View>(null);

  // Re-read when the index changes: the path-snapped route arrives a moment after saving.
  useEffect(() => {
    load();
    setWalk(get(id));
  }, [id, get, load, walks]);

  const hasAlt = !!walk?.points.some((p) => p.alt != null);
  const coloured = useMemo(() => (walk && overlay !== 'plain' ? colourSegments(walk.points, overlay) : null), [walk, overlay]);
  const profile = useMemo(() => (walk ? elevationProfile(walk.points) : []), [walk]);
  const line = useMemo(() => walk?.points.map((p) => [p.lng, p.lat] as [number, number]) ?? [], [walk]);
  const bounds = useMemo(() => (walk ? boundsOf(walk.points) : null), [walk]);
  const highlight = useMemo(() => (walk && km ? pointsInKm(walk.points, km).map((p) => [p.lng, p.lat] as [number, number]) : undefined), [walk, km]);
  const highlightBounds = useMemo(() => (walk && km ? boundsOf(pointsInKm(walk.points, km)) : null), [walk, km]);

  if (walk === undefined) return <Screen><View /></Screen>;
  if (!walk) {
    return (
      <Screen>
        <BackBar onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
          <T v="heading" style={{ textAlign: 'center' }}>This walk is no longer on this phone.</T>
          <Button label="My walks" tone="ghost" onPress={() => router.replace('/walk/history' as never)} />
        </View>
      </Screen>
    );
  }

  const s = walk.stats;
  const fastest = walk.splits.length ? Math.min(...walk.splits.map((x) => x.ms)) : 0;
  const slowest = walk.splits.length ? Math.max(...walk.splits.map((x) => x.ms)) : 0;
  const when = new Date(walk.startedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const at = new Date(walk.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const others = walks.filter((w) => w.id !== walk.id);

  const keepRoute = () => {
    // The walked line becomes a route to follow again; without turn instructions, it is drawn to follow by eye.
    const stride = Math.max(1, Math.ceil(line.length / 400));
    const coords = (walk.snapped?.coords ?? line).filter((_, i, a) => i % stride === 0 || i === a.length - 1);
    saveRoute({ id: newId(), name: walk.name, createdAt: Date.now(), coords, distance: walk.distance, duration: Math.round(walk.movingMs / 1000), maneuvers: [] });
    haptic.success();
    setSavedRoute(true);
  };

  return (
    <Screen>
      <BackBar onBack={() => router.back()} title={`${when} · ${at}`} />
      <ScrollView contentContainerStyle={{ gap: space.xl, paddingBottom: space.xxxl, paddingTop: space.md }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: space.sm }}>
          <T v="title">{walk.name}</T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {walk.records?.map((r) => <Pill key={r} label={r} tone="gold" />)}
            {walk.followed ? <Pill label={`Followed a ${fmtKm(walk.followed.distance, 1)} km route`} /> : null}
          </Row>
        </View>

        <View style={{ gap: space.md }}>
          <WalkMap
            style={styles.map}
            route={line}
            segments={coloured?.segments}
            highlight={highlight}
            start={line[0]}
            end={line[line.length - 1]}
            camera={highlightBounds ? { kind: 'bounds', bounds: highlightBounds } : bounds ? { kind: 'bounds', bounds } : { kind: 'free' }}
          />
          <Segmented options={hasAlt ? OVERLAYS : OVERLAYS.slice(0, 3)} value={overlay} onChange={setOverlay} />
          {overlay !== 'plain' ? <Legend low={LEGEND[overlay][0]} high={LEGEND[overlay][1]} /> : null}
        </View>

        <Card style={{ gap: space.lg }}>
          <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
            <StatCell label="Distance" value={fmtKm(walk.distance)} unit="km" big tint={color.volt} />
            <StatCell label="Moving time" value={fmtDuration(walk.movingMs)} />
          </Row>
          <Row gap={space.md}>
            <StatCell label="Avg pace" value={fmtPace(s.pace)} unit="/km" />
            <StatCell label="Avg speed" value={fmtSpeed(s.avgSpeed)} unit="km/h" />
            <StatCell label="Top speed" value={fmtSpeed(s.maxSpeed)} unit="km/h" />
          </Row>
          <Row gap={space.md}>
            <StatCell label="Steps" value={s.steps ? s.steps.toLocaleString() : '—'} />
            <StatCell label="Cadence" value={s.cadence ? String(s.cadence) : '—'} unit="spm" />
            <StatCell label="Peak cadence" value={s.maxCadence ? String(s.maxCadence) : '—'} unit="spm" />
          </Row>
          <Row gap={space.md}>
            <StatCell label="Stride" value={s.stride ? s.stride.toFixed(2) : '—'} unit="m" />
            <StatCell label="Climb" value={String(s.gain)} unit="m" />
            <StatCell label="Descent" value={String(s.loss)} unit="m" />
          </Row>
          <T v="caption" style={{ fontSize: 11 }}>
            Total time {fmtDuration(walk.endedAt - walk.startedAt)}, including pauses.
            {walk.snapped ? ` Matched to mapped paths: ${fmtKm(walk.snapped.distance)} km.` : ''}
          </T>
        </Card>

        {walk.splits.length ? (
          <View style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="label">Splits</T>
              <T v="caption" style={{ fontSize: 12 }}>{km ? 'Tap again to clear' : 'Tap one to see it on the map'}</T>
            </Row>
            {walk.splits.map((sp) => {
              const share = slowest > fastest ? 1 - (sp.ms - fastest) / (slowest - fastest) : 1;
              const on = km === sp.km;
              return (
                <Pressable key={sp.km} onPress={() => { haptic.select(); setKm(on ? null : sp.km); }} style={[styles.split, on && { backgroundColor: color.raised }]} accessibilityRole="button" accessibilityLabel={`Kilometre ${sp.km}, ${fmtDuration(sp.ms)}`}>
                  <T style={[type.num, { fontSize: 15, width: 30 }]}>{sp.km}</T>
                  <View style={styles.splitTrack}>
                    <View style={{ width: `${35 + share * 65}%`, height: '100%', borderRadius: 4, backgroundColor: sp.ms === fastest && walk.splits.length > 1 ? color.volt : color.faint }} />
                  </View>
                  <T style={[type.num, { fontSize: 15, width: 58, textAlign: 'right' }]}>{fmtDuration(sp.ms)}</T>
                  <T v="caption" style={{ width: 52, textAlign: 'right', fontSize: 11 }}>{sp.gain ? `+${sp.gain} m` : sp.loss ? `−${sp.loss} m` : ''}</T>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {profile.length ? (
          <Card style={{ gap: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="label">Elevation</T>
              <T v="caption" style={{ fontSize: 12 }}>{Math.round(Math.min(...profile.map((p) => p.alt)))}–{Math.round(Math.max(...profile.map((p) => p.alt)))} m</T>
            </Row>
            <ElevationChart profile={profile} width={width - space.lg * 4} />
            <T v="caption" style={{ fontSize: 11 }}>From GPS altitude, which is approximate.</T>
          </Card>
        ) : null}

        <View style={{ gap: space.md }}>
          <Button label="Replay" onPress={() => router.push(`/walk/replay/${walk.id}` as never)} />
          <Button label="Share" tone="ghost" onPress={() => shareCard(cardRef, `${fmtKm(walk.distance)} km in ${fmtDuration(walk.movingMs)} on StepPool.`)} />
          {others.length ? <Button label="Compare with another walk" tone="ghost" onPress={() => router.push({ pathname: '/walk/history', params: { compare: walk.id } } as never)} /> : null}
          <Button label={savedRoute ? 'Saved to your routes' : 'Save as a route to walk again'} tone="ghost" onPress={keepRoute} disabled={savedRoute} />
          <HoldButton label="Hold to delete" tone="danger" onConfirm={() => { remove(walk.id); router.back(); }} />
        </View>
      </ScrollView>

      <View style={styles.offscreen} pointerEvents="none">
        <WalkCard ref={cardRef} name={name} title={walk.name} line={walk.line} distance={walk.distance} movingMs={walk.movingMs} pace={s.pace} steps={s.steps} records={walk.records} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: 24 },
  split: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.sm, borderRadius: 12 },
  splitTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: color.raised, overflow: 'hidden' },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
