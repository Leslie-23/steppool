// One map for every walk screen: recording, details, replay, compare, heatmap and route planning.
// MapLibre with free OpenStreetMap-based tiles (OpenFreeMap), so there is no API key or account behind it.
import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ColouredSegment } from '@/shared/walk';
import { color } from '@/theme/tokens';

import { SCALE } from './scale';

const STYLE = 'https://tiles.openfreemap.org/styles/dark';
type LngLat = [number, number];

export type MapCamera =
  /** Stay on the walker. `bearing`/`pitch` tilt the view for the 3D replay. */
  | { kind: 'follow'; zoom?: number; pitch?: number; bearing?: number }
  | { kind: 'bounds'; bounds: [number, number, number, number]; pitch?: number }
  | { kind: 'free' };

const line = (coords: LngLat[], properties: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: coords } });
const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

const BANDS = 10;

/** Joins neighbouring segments in the same colour band into one line, so the map draws tens of features, not thousands. */
function banded(segments: ColouredSegment[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  let run: LngLat[] = [];
  let band = -1;
  for (const s of segments) {
    const b = Math.min(BANDS - 1, Math.floor(s.v * BANDS));
    if (b !== band) {
      if (run.length > 1) features.push(line(run, { v: (band + 0.5) / BANDS }));
      run = [s.from];
      band = b;
    }
    run.push(s.to);
  }
  if (run.length > 1) features.push(line(run, { v: (band + 0.5) / BANDS }));
  return collection(features);
}

const CAP = { 'line-cap': 'round', 'line-join': 'round' } as const;

export function WalkMap({
  style,
  route,
  segments,
  planned,
  second,
  highlight,
  heat,
  position,
  start,
  end,
  pin,
  camera,
  initialCenter,
  interactive = true,
  buildings3d = false,
  onLongPress,
  onUserPan,
}: {
  style?: StyleProp<ViewStyle>;
  /** The walked route as one plain line. */
  route?: LngLat[];
  /** The walked route coloured by pace, speed, elevation or gradient. Drawn instead of `route`. */
  segments?: ColouredSegment[];
  /** A route to follow, drawn dashed underneath. */
  planned?: LngLat[];
  /** A second walk for comparison, in gold. */
  second?: LngLat[];
  /** Part of the route to emphasise (a tapped kilometre). */
  highlight?: LngLat[];
  /** Every past walk, for the heatmap. */
  heat?: LngLat[][];
  position?: { lng: number; lat: number } | null;
  start?: LngLat;
  end?: LngLat;
  /** A chosen destination. */
  pin?: LngLat | null;
  camera: MapCamera;
  initialCenter?: LngLat;
  interactive?: boolean;
  buildings3d?: boolean;
  onLongPress?: (at: LngLat) => void;
  onUserPan?: () => void;
}) {
  const cam = useRef<CameraRef>(null);
  const coloured = useMemo(() => (segments?.length ? banded(segments) : null), [segments]);
  const heatLines = useMemo(() => (heat?.length ? collection(heat.filter((l) => l.length > 1).map((l) => line(l))) : null), [heat]);
  const heatPoints = useMemo(
    () => (heat?.length ? collection(heat.flatMap((l) => l.map((c): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })))) : null),
    [heat],
  );

  const followKey = camera.kind === 'follow' && position ? `${position.lng.toFixed(5)},${position.lat.toFixed(5)},${camera.zoom ?? ''},${camera.pitch ?? 0},${Math.round(camera.bearing ?? 0)}` : '';
  useEffect(() => {
    if (camera.kind !== 'follow' || !position) return;
    cam.current?.easeTo({ center: [position.lng, position.lat], zoom: camera.zoom ?? 16.5, pitch: camera.pitch ?? 0, bearing: camera.bearing ?? 0, duration: 900, easing: 'linear' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followKey]);

  const boundsKey = camera.kind === 'bounds' ? `${camera.bounds.map((n) => n.toFixed(5)).join(',')},${camera.pitch ?? 0}` : '';
  useEffect(() => {
    if (camera.kind !== 'bounds') return;
    cam.current?.fitBounds(camera.bounds, { padding: { top: 48, right: 36, bottom: 48, left: 36 }, pitch: camera.pitch ?? 0, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  const first = initialCenter ?? (position ? ([position.lng, position.lat] as LngLat) : (route?.[0] ?? planned?.[0] ?? start));
  return (
    <View style={[styles.wrap, style]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={STYLE}
        logo={false}
        compass={false}
        attribution
        attributionPosition={{ bottom: 6, left: 8 }}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        touchRotate={interactive}
        touchPitch={false}
        onLongPress={onLongPress ? (e) => onLongPress(e.nativeEvent.lngLat as LngLat) : undefined}
        onRegionWillChange={onUserPan ? (e) => e.nativeEvent.userInteraction && onUserPan() : undefined}
      >
        <Camera
          ref={cam}
          initialViewState={camera.kind === 'bounds' ? { bounds: camera.bounds, padding: { top: 48, right: 36, bottom: 48, left: 36 } } : first ? { center: first, zoom: camera.kind === 'follow' ? (camera.zoom ?? 16.5) : 14 } : { center: [-0.187, 5.6037], zoom: 11 }}
          maxZoom={19}
        />

        {buildings3d ? (
          <Layer
            id="walk-buildings"
            type="fill-extrusion"
            source="openmaptiles"
            source-layer="building"
            minzoom={14}
            paint={{ 'fill-extrusion-color': '#1B1F26', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 }}
          />
        ) : null}

        {heatPoints && heatLines ? (
          <>
            <GeoJSONSource id="walk-heat-points" data={heatPoints}>
              <Layer id="walk-heat" type="heatmap" paint={{ 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 18], 'heatmap-intensity': 0.7, 'heatmap-opacity': 0.75, 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(215,255,58,0)', 0.3, 'rgba(215,255,58,0.35)', 0.7, '#E8C36A', 1, '#FF5A4E'] }} />
            </GeoJSONSource>
            <GeoJSONSource id="walk-heat-lines" data={heatLines}>
              <Layer id="walk-heat-line" type="line" layout={CAP} paint={{ 'line-color': color.volt, 'line-width': 2, 'line-opacity': 0.45 }} />
            </GeoJSONSource>
          </>
        ) : null}

        {planned && planned.length > 1 ? (
          <GeoJSONSource id="walk-planned" data={line(planned)}>
            <Layer id="walk-planned-line" type="line" layout={CAP} paint={{ 'line-color': '#F4F1EA', 'line-width': 5, 'line-opacity': 0.55, 'line-dasharray': [0.6, 1.8] }} />
          </GeoJSONSource>
        ) : null}

        {second && second.length > 1 ? (
          <GeoJSONSource id="walk-second" data={line(second)}>
            <Layer id="walk-second-line" type="line" layout={CAP} paint={{ 'line-color': color.gold, 'line-width': 4, 'line-opacity': 0.9 }} />
          </GeoJSONSource>
        ) : null}

        {coloured ? (
          <GeoJSONSource id="walk-coloured" data={coloured}>
            <Layer id="walk-coloured-casing" type="line" layout={CAP} paint={{ 'line-color': '#07080A', 'line-width': 8, 'line-opacity': 0.6 }} />
            <Layer id="walk-coloured-line" type="line" layout={CAP} paint={{ 'line-color': ['interpolate', ['linear'], ['get', 'v'], 0, SCALE[0], 0.5, SCALE[1], 1, SCALE[2]], 'line-width': 5 }} />
          </GeoJSONSource>
        ) : route && route.length > 1 ? (
          <GeoJSONSource id="walk-route" data={line(route)}>
            <Layer id="walk-route-casing" type="line" layout={CAP} paint={{ 'line-color': '#07080A', 'line-width': 8, 'line-opacity': 0.6 }} />
            <Layer id="walk-route-line" type="line" layout={CAP} paint={{ 'line-color': color.volt, 'line-width': 5 }} />
          </GeoJSONSource>
        ) : null}

        {highlight && highlight.length > 1 ? (
          <GeoJSONSource id="walk-highlight" data={line(highlight)}>
            <Layer id="walk-highlight-line" type="line" layout={CAP} paint={{ 'line-color': '#FFFFFF', 'line-width': 7 }} />
          </GeoJSONSource>
        ) : null}

        {start ? (
          <Marker id="walk-start" lngLat={start}>
            <View style={[styles.dot, { backgroundColor: color.bg, borderColor: color.volt }]} />
          </Marker>
        ) : null}
        {end ? (
          <Marker id="walk-end" lngLat={end}>
            <View style={[styles.dot, { backgroundColor: color.gold, borderColor: color.bg }]} />
          </Marker>
        ) : null}
        {pin ? (
          <Marker id="walk-pin" lngLat={pin} anchor="bottom">
            <View style={styles.pin}>
              <View style={styles.pinHead} />
              <View style={styles.pinStem} />
            </View>
          </Marker>
        ) : null}
        {position ? (
          <Marker id="walk-me" lngLat={[position.lng, position.lat]}>
            <View style={styles.meHalo}>
              <View style={styles.me} />
            </View>
          </Marker>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: color.surface },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  meHalo: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(215,255,58,0.22)', alignItems: 'center', justifyContent: 'center' },
  me: { width: 14, height: 14, borderRadius: 7, backgroundColor: color.volt, borderWidth: 2.5, borderColor: color.bg },
  pin: { alignItems: 'center' },
  pinHead: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.gold, borderWidth: 3, borderColor: color.bg },
  pinStem: { width: 2.5, height: 10, backgroundColor: color.gold },
});
