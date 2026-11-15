import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '@/components/ds/Segmented';
import { Button, Card, Press, Row, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { RouteThumb } from '@/components/walk/bits';
import { WalkMap } from '@/components/walk/WalkMap';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { newId, useWalks } from '@/lib/walk/store';
import type { SavedRoute } from '@/lib/walk/types';
import { boundsOf, fmtKm, type PlannedRoute } from '@/shared/walk';
import { color, radius, space } from '@/theme/tokens';

const LOOPS = [1, 2, 3, 5, 8].map((km) => ({ label: `${km} km`, value: km }));
type LngLat = [number, number];

/** Choose something to follow: a suggested loop from here, a place picked on the map, or a saved route. */
export default function PlanRoute() {
  const insets = useSafeAreaInsets();
  const { routes, saveRoute, removeRoute, load } = useWalks();
  const [mode, setMode] = useState<'loop' | 'place' | 'saved'>('loop');
  const [here, setHere] = useState<LngLat | null>(null);
  const [needsLocation, setNeedsLocation] = useState(false);
  const [km, setKm] = useState(3);
  const [seed, setSeed] = useState(0);
  const [pin, setPin] = useState<LngLat | null>(null);
  const [route, setRoute] = useState<PlannedRoute | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const locate = async (ask: boolean) => {
    const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return setNeedsLocation(true);
    setNeedsLocation(false);
    const at = (await Location.getLastKnownPositionAsync().catch(() => null)) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
    if (at) setHere([at.coords.longitude, at.coords.latitude]);
  };
  useEffect(() => {
    locate(false);
  }, []);

  const ask = async (make: () => Promise<PlannedRoute>) => {
    setBusy(true);
    setError(null);
    try {
      setRoute(await make());
      haptic.select();
    } catch (e) {
      setRoute(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A loop is suggested as soon as there is somewhere to start from; changing the length or asking for another redraws it.
  useEffect(() => {
    if (mode === 'loop' && here) ask(() => api.loop(here, km * 1000, seed));
  }, [mode, here, km, seed]);

  const pick = (at: LngLat) => {
    if (mode !== 'place' || !here) return;
    setPin(at);
    ask(() => api.directions(here, at));
  };

  const name = mode === 'loop' ? `${fmtKm(route?.distance ?? km * 1000, 1)} km loop` : 'Walk to pin';
  const follow = (r: SavedRoute) => router.replace({ pathname: '/walk', params: { route: r.id } } as never);
  const startNew = (keep: boolean) => {
    if (!route) return;
    // Routes are followed from the saved list, so a one-off route is stored too (and can be removed there).
    const saved: SavedRoute = { id: newId(), name, createdAt: Date.now(), ...route };
    saveRoute(saved);
    haptic.commit();
    if (keep) {
      setMode('saved');
      setRoute(null);
    } else follow(saved);
  };

  const bounds = route ? boundsOf(route.coords.map(([lng, lat]) => ({ lng, lat }))) : null;
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <WalkMap
        style={{ height: '46%' }}
        planned={mode === 'saved' ? undefined : route?.coords}
        position={here ? { lng: here[0], lat: here[1] } : null}
        pin={mode === 'place' ? pin : null}
        camera={bounds && mode !== 'saved' ? { kind: 'bounds', bounds } : here ? { kind: 'follow', zoom: 15 } : { kind: 'free' }}
        onLongPress={pick}
      />
      <Press onPress={() => router.back()} style={[styles.round, { top: insets.top + space.sm }]} accessibilityLabel="Back" accessibilityRole="button">
        <IconSymbol name="chevron.left" size={20} color={color.text} />
      </Press>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }} showsVerticalScrollIndicator={false}>
        <T v="title">Follow a route</T>
        <Segmented options={[{ label: 'Loop', value: 'loop' }, { label: 'To a place', value: 'place' }, { label: `Saved${routes.length ? ` (${routes.length})` : ''}`, value: 'saved' }]} value={mode} onChange={(m) => { setMode(m); setRoute(null); setError(null); }} />

        {needsLocation && mode !== 'saved' ? (
          <Card style={{ gap: space.sm }}>
            <T v="body" style={{ fontSize: 14 }}>Routes start from where you are. StepPool uses your location only while you plan or record a walk.</T>
            <Button label="Continue" onPress={() => locate(true)} />
          </Card>
        ) : null}

        {mode === 'loop' ? (
          <View style={{ gap: space.md }}>
            <T v="caption">A walk that starts and ends where you are standing.</T>
            <Segmented options={LOOPS} value={km} onChange={(v) => { setKm(v); setSeed(0); }} />
          </View>
        ) : mode === 'place' ? (
          <T v="caption">{pin ? 'Press and hold somewhere else to change the destination.' : 'Press and hold on the map to choose where to walk to.'}</T>
        ) : null}

        {mode !== 'saved' ? (
          <>
            {error ? <T v="caption" style={{ color: color.danger }}>{error}</T> : null}
            {route ? (
              <Card style={{ gap: space.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View>
                    <T v="heading">{fmtKm(route.distance, 1)} km</T>
                    <T v="caption">About {Math.round(route.duration / 60)} min · {route.maneuvers.filter((m) => m.kind !== 'depart' && m.kind !== 'arrive').length} turns</T>
                  </View>
                  {mode === 'loop' ? (
                    <Press onPress={() => setSeed((s) => s + 1)} disabled={busy} accessibilityRole="button" accessibilityLabel="Suggest another loop">
                      <Row gap={6} style={styles.another}>
                        <IconSymbol name="arrow.clockwise" size={14} color={color.volt} />
                        <T v="caption" style={{ color: color.volt }}>{busy ? 'Finding…' : 'Another'}</T>
                      </Row>
                    </Press>
                  ) : null}
                </Row>
                <Button label="Walk this route" onPress={() => startNew(false)} />
                <Button label="Save for later" tone="ghost" onPress={() => startNew(true)} />
              </Card>
            ) : busy ? (
              <T v="caption">Finding a route…</T>
            ) : null}
            <T v="caption" style={{ fontSize: 11 }}>Walking routes cover Ghana. Elsewhere you can still record a walk without directions.</T>
          </>
        ) : routes.length ? (
          routes.map((r) => (
            <Card key={r.id}>
              <Row gap={space.md}>
                <RouteThumb line={r.coords} size={52} />
                <View style={{ flex: 1 }}>
                  <T v="heading" style={{ fontSize: 16 }}>{r.name}</T>
                  <T v="caption">{fmtKm(r.distance, 1)} km · about {Math.round(r.duration / 60)} min</T>
                </View>
              </Row>
              <Row gap={space.md} style={{ marginTop: space.md }}>
                <View style={{ flex: 1 }}>
                  <Button label="Walk it" onPress={() => follow(r)} />
                </View>
                <Press onPress={() => removeRoute(r.id)} style={styles.trash} accessibilityRole="button" accessibilityLabel={`Remove ${r.name}`}>
                  <IconSymbol name="trash.fill" size={18} color={color.muted} />
                </Press>
              </Row>
            </Card>
          ))
        ) : (
          <T v="caption">No saved routes yet. Save a loop, a route to a place, or any walk you have recorded.</T>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { position: 'absolute', left: space.lg, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(7,8,10,0.78)', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  another: { backgroundColor: color.voltDim, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  trash: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: color.hairline, alignItems: 'center', justifyContent: 'center' },
});
