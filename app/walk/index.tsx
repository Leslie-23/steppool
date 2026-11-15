import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoldButton } from '@/components/ds/HoldButton';
import { Button, Card, Press, Row, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GpsChip, StatCell, TurnBanner } from '@/components/walk/bits';
import { WalkMap } from '@/components/walk/WalkMap';
import { haptic } from '@/lib/haptics';
import { MIN_WALK_M, recorder, useRecorder } from '@/lib/walk/recorder';
import { useWalks } from '@/lib/walk/store';
import { fmtDuration, fmtKm, fmtPace, fmtSpeed, paceOf } from '@/shared/walk';
import { color, radius, space } from '@/theme/tokens';

/** Record a walk: live map, the route drawn behind you, and the numbers that matter while moving. */
export default function RecordWalk() {
  const insets = useSafeAreaInsets();
  const { route: routeId } = useLocalSearchParams<{ route?: string }>();
  const { status, track, stats, gps, nav, noSteps } = useRecorder();
  const routes = useWalks((s) => s.routes);
  const loadWalks = useWalks((s) => s.load);
  const [here, setHere] = useState<{ lng: number; lat: number } | null>(null);
  const [following, setFollowing] = useState(true);
  const [problem, setProblem] = useState<'location-denied' | 'location-off' | 'failed' | 'short' | null>(null);
  const [busy, setBusy] = useState(false);
  const idle = status === 'idle';
  // A saved or freshly planned route chosen on the plan screen, to follow on this walk.
  const chosen = useMemo(() => routes.find((r) => r.id === routeId), [routes, routeId]);

  useEffect(() => {
    loadWalks();
    recorder.hydrate();
  }, [loadWalks]);

  // Before recording, show where the walker is, but only if location was already allowed: the
  // permission question is asked when they press Start, never on arrival.
  useEffect(() => {
    if (!idle) return;
    let cancelled = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const last = (await Location.getLastKnownPositionAsync().catch(() => null)) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
      if (last && !cancelled) setHere({ lng: last.coords.longitude, lat: last.coords.latitude });
    })();
    return () => {
      cancelled = true;
    };
  }, [idle]);

  const position = track?.last ? { lng: track.last.lng, lat: track.last.lat } : here;
  const line = useMemo(() => track?.points.map((p) => [p.lng, p.lat] as [number, number]), [track?.points]);
  const planned = nav?.route.coords ?? chosen?.coords;
  const progress = nav?.progress;

  const start = async () => {
    setBusy(true);
    setProblem(null);
    const result = await recorder.start(chosen ? { name: chosen.name, route: chosen } : undefined);
    setBusy(false);
    if (result === 'started') {
      haptic.success();
      setFollowing(true);
    } else {
      haptic.error();
      setProblem(result);
    }
  };

  const finish = async () => {
    setBusy(true);
    const id = await recorder.finish();
    setBusy(false);
    if (id) {
      haptic.success();
      router.replace(`/walk/${id}` as never);
    } else {
      setProblem('short');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <WalkMap
        style={StyleSheet.absoluteFill}
        route={line}
        planned={planned}
        position={position}
        start={line?.[0]}
        end={planned?.[planned.length - 1]}
        camera={following ? { kind: 'follow', zoom: 16.5 } : { kind: 'free' }}
        onUserPan={() => setFollowing(false)}
      />

      <View style={[styles.top, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <Row style={{ justifyContent: 'space-between' }}>
          <Press onPress={() => router.back()} style={styles.round} accessibilityLabel="Back" accessibilityRole="button">
            <IconSymbol name="chevron.left" size={20} color={color.text} />
          </Press>
          {idle ? null : <GpsChip quality={gps} accuracy={track?.last?.acc} />}
          <Row gap={space.sm}>
            {!following ? (
              <Press onPress={() => setFollowing(true)} style={styles.round} accessibilityLabel="Centre on me" accessibilityRole="button">
                <IconSymbol name="location.fill" size={18} color={color.volt} />
              </Press>
            ) : null}
            <Press onPress={() => router.push('/settings/walk' as never)} style={styles.round} accessibilityLabel="Walk settings" accessibilityRole="button">
              <IconSymbol name="gearshape.fill" size={18} color={color.text} />
            </Press>
          </Row>
        </Row>
        {!idle && progress ? (
          <View style={{ marginTop: space.md }}>
            {progress.arrived ? (
              <TurnBanner text="You have arrived" kind="arrive" />
            ) : progress.offRoute ? (
              <TurnBanner text="You're off the route. Head back to the dashed line." kind="off" warn />
            ) : progress.next ? (
              <TurnBanner text={progress.next.text} kind={progress.next.kind} distance={progress.toNext} />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        {idle ? (
          <View style={{ gap: space.lg }}>
            <View style={{ gap: 4 }}>
              <T v="title">{chosen ? chosen.name : 'Record a walk'}</T>
              <T v="caption">
                {chosen
                  ? `${fmtKm(chosen.distance, 1)} km · about ${Math.round(chosen.duration / 60)} min. Turn-by-turn directions will guide you.`
                  : 'See your route, distance, pace and steps as you go. It keeps recording with your phone locked.'}
              </T>
            </View>
            {problem === 'location-denied' ? (
              <Card style={{ gap: space.sm }}>
                <T v="body" style={{ fontSize: 14 }}>StepPool needs your location to draw your route and measure distance. It is used only while you record a walk.</T>
                <Button label="Open Settings" tone="ghost" onPress={() => Linking.openSettings()} />
              </Card>
            ) : problem === 'location-off' ? (
              <T v="caption" style={{ color: color.danger }}>Location is switched off on this phone. Turn it on, then start again.</T>
            ) : problem === 'failed' ? (
              <T v="caption" style={{ color: color.danger }}>Recording could not start. Try again in a moment.</T>
            ) : problem === 'short' ? (
              <T v="caption">That walk was under {MIN_WALK_M} metres, so it was not saved.</T>
            ) : null}
            <Button label={busy ? 'Starting…' : 'Start'} onPress={start} disabled={busy} />
            <Row gap={space.md}>
              <View style={{ flex: 1 }}>
                <Button label={chosen ? 'Change route' : 'Follow a route'} tone="ghost" onPress={() => router.push('/walk/plan' as never)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="My walks" tone="ghost" onPress={() => router.push('/walk/history' as never)} />
              </View>
            </Row>
          </View>
        ) : (
          <View style={{ gap: space.lg }}>
            <Row gap={space.lg} style={{ alignItems: 'flex-end' }}>
              <StatCell label="Distance" value={fmtKm(stats?.distance ?? 0)} unit="km" big />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <T v="label" style={{ fontSize: 10, color: status === 'recording' ? color.volt : color.gold }}>
                  {status === 'recording' ? 'Recording' : status === 'autopaused' ? 'Auto-paused' : 'Paused'}
                </T>
                <T style={[styles.time]}>{fmtDuration(stats?.movingMs ?? 0)}</T>
              </View>
            </Row>
            <Row gap={space.md}>
              <StatCell label="Speed" value={fmtSpeed(status === 'recording' ? (track?.speed ?? 0) : 0)} unit="km/h" />
              <StatCell label="Pace now" value={fmtPace(status === 'recording' ? paceOf(track?.speed ?? 0) : null)} unit="/km" />
              <StatCell label="Avg pace" value={fmtPace(stats?.pace)} unit="/km" />
            </Row>
            <Row gap={space.md}>
              <StatCell label="Steps" value={noSteps ? '—' : (stats?.steps ?? 0).toLocaleString()} />
              <StatCell label="Cadence" value={noSteps || !stats?.cadence ? '—' : String(stats.cadence)} unit="spm" />
              <StatCell label="Climb" value={String(stats?.gain ?? 0)} unit="m" />
            </Row>
            <Row gap={space.md}>
              <View style={{ flex: 1 }}>
                {status === 'paused' ? <Button label="Resume" onPress={() => { haptic.commit(); recorder.resume(); }} /> : <Button label="Pause" tone="ghost" onPress={() => { haptic.commit(); recorder.pause(); }} />}
              </View>
              <View style={{ flex: 1 }}>
                <HoldButton label={busy ? 'Saving…' : 'Hold to finish'} onConfirm={finish} tone="gold" disabled={busy} />
              </View>
            </Row>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.lg, right: space.lg },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(7,8,10,0.78)', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,8,10,0.94)', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  time: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30, letterSpacing: -0.8, color: color.text, fontVariant: ['tabular-nums'] },
});
