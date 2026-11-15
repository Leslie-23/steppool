import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press, Row, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ElevationChart, StatCell } from '@/components/walk/bits';
import { WalkMap } from '@/components/walk/WalkMap';
import { haptic } from '@/lib/haptics';
import { useWalks } from '@/lib/walk/store';
import type { SavedWalk } from '@/lib/walk/types';
import { boundsOf, elevationProfile, fmtDuration, fmtKm, fmtPace, fmtSpeed, paceOf, positionAt } from '@/shared/walk';
import { color, radius, space } from '@/theme/tokens';

/** A whole walk plays back in about this long at 1×, whatever its real length. */
const BASE_MS = 40_000;
const SPEEDS = [1, 2, 4] as const;

/** Replays a walk: a marker retraces the route while the numbers count up. Flyover tilts the map into 3D and follows it. */
export default function Replay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const get = useWalks((s) => s.get);
  const [walk, setWalk] = useState<SavedWalk | null>(null);
  /** Moving-time position in the walk, ms. */
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [flyover, setFlyover] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const atRef = useRef(0);

  useEffect(() => {
    setWalk(get(id));
  }, [id, get]);

  const total = walk?.movingMs ?? 0;
  const profile = useMemo(() => (walk ? elevationProfile(walk.points) : []), [walk]);
  const bounds = useMemo(() => (walk ? boundsOf(walk.points) : null), [walk]);
  const full = useMemo(() => walk?.points.map((p) => [p.lng, p.lat] as [number, number]) ?? [], [walk]);

  useEffect(() => {
    if (!playing || !total) return;
    let frame = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      atRef.current = Math.min(total, atRef.current + ((now - last) / BASE_MS) * total * speed);
      last = now;
      setAt(atRef.current);
      if (atRef.current >= total) return setPlaying(false);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, total]);

  const pos = useMemo(() => (walk ? positionAt(walk.points, at) : null), [walk, at]);
  // The route so far: recorded points up to the marker, then the marker itself.
  const done = useMemo(() => (pos ? [...full.slice(0, pos.index + 1), [pos.lng, pos.lat] as [number, number]] : []), [full, pos]);

  const seek = (x: number) => {
    if (!barWidth || !total) return;
    atRef.current = Math.min(total, Math.max(0, (x / barWidth) * total));
    setAt(atRef.current);
  };
  const toggle = () => {
    haptic.select();
    if (at >= total) {
      atRef.current = 0;
      setAt(0);
    }
    setPlaying((p) => (at >= total ? true : !p));
  };

  if (!walk || !pos) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  const fraction = total ? at / total : 0;
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <WalkMap
        style={StyleSheet.absoluteFill}
        planned={full}
        route={done}
        position={pos}
        start={full[0]}
        end={full[full.length - 1]}
        buildings3d={flyover}
        camera={flyover ? { kind: 'follow', zoom: 17, pitch: 60, bearing: pos.heading } : bounds ? { kind: 'bounds', bounds } : { kind: 'free' }}
        interactive={!flyover}
      />

      <Row style={[styles.top, { top: insets.top + space.sm }]}>
        <Press onPress={() => router.back()} style={styles.round} accessibilityLabel="Back" accessibilityRole="button">
          <IconSymbol name="chevron.left" size={20} color={color.text} />
        </Press>
        <Press onPress={() => { haptic.select(); setFlyover((f) => !f); }} style={[styles.pill, flyover && { backgroundColor: color.volt }]} accessibilityRole="button" accessibilityLabel={flyover ? 'Back to the flat map' : 'Flyover in 3D'}>
          <Row gap={6}>
            <IconSymbol name="cube.fill" size={15} color={flyover ? color.bg : color.text} />
            <T v="caption" style={{ color: flyover ? color.bg : color.text }}>Flyover</T>
          </Row>
        </Press>
      </Row>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <Row gap={space.md}>
          <StatCell label="Distance" value={fmtKm(pos.d)} unit="km" />
          <StatCell label="Time" value={fmtDuration(at)} />
          <StatCell label="Pace" value={fmtPace(paceOf(pos.v))} unit="/km" />
          <StatCell label="Speed" value={fmtSpeed(pos.v)} unit="km/h" />
        </Row>
        {profile.length && barWidth ? <ElevationChart profile={profile} width={barWidth} height={54} mark={walk.distance ? pos.d / walk.distance : 0} /> : null}
        <Pressable
          onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
          onPress={(e) => seek(e.nativeEvent.locationX)}
          hitSlop={{ top: 14, bottom: 14 }}
          accessibilityRole="adjustable"
          accessibilityLabel={`Replay position, ${Math.round(fraction * 100)} percent`}
        >
          <View style={styles.track}>
            <View style={{ width: `${fraction * 100}%`, height: '100%', backgroundColor: color.volt, borderRadius: 3 }} />
          </View>
        </Pressable>
        <Row style={{ justifyContent: 'space-between' }}>
          <Press onPress={toggle} style={styles.play} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'}>
            <IconSymbol name={playing ? 'pause.fill' : 'play.fill'} size={22} color={color.bg} />
          </Press>
          <Row gap={space.sm}>
            {SPEEDS.map((sp) => (
              <Press key={sp} onPress={() => { haptic.select(); setSpeed(sp); }} style={[styles.speed, speed === sp && { backgroundColor: color.voltDim, borderColor: color.volt }]} accessibilityRole="button" accessibilityLabel={`${sp} times speed`}>
                <T v="caption" style={{ color: speed === sp ? color.volt : color.text }}>{sp}×</T>
              </Press>
            ))}
          </Row>
        </Row>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.lg, right: space.lg, justifyContent: 'space-between' },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(7,8,10,0.78)', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  pill: { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: 'rgba(7,8,10,0.78)', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,8,10,0.94)', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  track: { height: 6, borderRadius: 3, backgroundColor: color.raised, overflow: 'hidden' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center' },
  speed: { minWidth: 48, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.hairline, alignItems: 'center', justifyContent: 'center' },
});
