// Small pieces shared by the walk screens.
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';

import { Row, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { GpsQuality } from '@/lib/walk/recorder';
import { fmtDistanceShort } from '@/shared/walk';
import { color, radius, space, type } from '@/theme/tokens';

import { SCALE } from './scale';

type Icon = Parameters<typeof IconSymbol>[0]['name'];

export function BackBar({ onBack, title, right }: { onBack: () => void; title?: string; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm, minHeight: 28 }}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back" accessibilityRole="button">
        <IconSymbol name="chevron.left" size={22} color={color.text} />
      </Pressable>
      {title ? <T v="label">{title}</T> : <View />}
      {right ?? <View style={{ width: 22 }} />}
    </Row>
  );
}

export function StatCell({ label, value, unit, big, tint }: { label: string; value: string; unit?: string; big?: boolean; tint?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <T v="label" style={{ fontSize: 10 }}>{label}</T>
      <Row gap={4} style={{ alignItems: 'flex-end' }}>
        <T style={[type.num, { fontSize: big ? 44 : 22, letterSpacing: big ? -1.5 : -0.4, color: tint ?? color.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
        {unit ? <T v="caption" style={{ marginBottom: big ? 9 : 3, fontSize: big ? 14 : 11 }}>{unit}</T> : null}
      </Row>
    </View>
  );
}

const GPS: Record<GpsQuality, { label: string; tint: string }> = {
  searching: { label: 'Finding GPS', tint: color.gold },
  weak: { label: 'Weak GPS', tint: color.danger },
  ok: { label: 'GPS good', tint: color.volt },
};

/** GPS quality with the accuracy in metres when there is a fix. */
export function GpsChip({ quality, accuracy }: { quality: GpsQuality; accuracy?: number | null }) {
  const g = GPS[quality];
  return (
    <View accessible accessibilityLabel={`${g.label}${accuracy ? `, accurate to ${Math.round(accuracy)} metres` : ''}`}>
      <Row gap={6} style={styles.chip}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: g.tint }} />
        <T v="caption" style={{ fontSize: 12, color: color.text }}>{g.label}{accuracy && quality !== 'searching' ? ` · ±${Math.round(accuracy)} m` : ''}</T>
      </Row>
    </View>
  );
}

export const turnIcon = (kind?: string): Icon => {
  switch (kind) {
    case 'left':
    case 'sharp left':
      return 'arrow.turn.up.left';
    case 'right':
    case 'sharp right':
      return 'arrow.turn.up.right';
    case 'slight left':
      return 'arrow.up.left';
    case 'slight right':
      return 'arrow.up.right';
    case 'uturn':
      return 'arrow.uturn.down';
    case 'arrive':
      return 'flag.checkered';
    case 'off':
      return 'exclamationmark.triangle.fill';
    case 'roundabout':
      return 'arrow.triangle.2.circlepath';
    default:
      return 'arrow.up';
  }
};

/** The next instruction on a planned route. */
export function TurnBanner({ text, kind, distance, warn }: { text: string; kind?: string; distance?: number; warn?: boolean }) {
  return (
    <Row gap={space.md} style={[styles.turn, warn && { borderColor: color.goldDim }]}>
      <View style={[styles.turnIcon, { backgroundColor: warn ? color.goldDim : color.voltDim }]}>
        <IconSymbol name={turnIcon(kind)} size={22} color={warn ? color.gold : color.volt} />
      </View>
      <View style={{ flex: 1 }}>
        {distance != null ? <T style={[type.num, { fontSize: 20 }]}>{fmtDistanceShort(distance)}</T> : null}
        <T v="body" style={{ fontSize: 14 }} numberOfLines={2}>{text}</T>
      </View>
    </Row>
  );
}

/** A route drawn small, north up, fitted to its box: for lists and share cards. */
export function RouteThumb({ line, size = 56, stroke = color.volt, width = 2.5 }: { line: [number, number][]; size?: number; stroke?: string; width?: number }) {
  if (line.length < 2) return <View style={{ width: size, height: size }} />;
  const k = Math.cos((line[0][1] * Math.PI) / 180);
  const xs = line.map((c) => c[0] * k);
  const ys = line.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1e-6;
  const pad = width + 2;
  const scale = (size - pad * 2) / span;
  const offX = (size - (Math.max(...xs) - minX) * scale) / 2;
  const offY = (size - (Math.max(...ys) - minY) * scale) / 2;
  const points = line.map((_, i) => `${(offX + (xs[i] - minX) * scale).toFixed(1)},${(size - offY - (ys[i] - minY) * scale).toFixed(1)}`).join(' ');
  return (
    <Svg width={size} height={size}>
      <Polyline points={points} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** What the two ends of the colour scale mean for the chosen overlay. */
export function Legend({ low, high }: { low: string; high: string }) {
  return (
    <Row gap={space.sm}>
      <T v="caption" style={{ fontSize: 11 }}>{low}</T>
      <Svg width={90} height={6}>
        <Defs>
          <LinearGradient id="scale" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={SCALE[0]} />
            <Stop offset="0.5" stopColor={SCALE[1]} />
            <Stop offset="1" stopColor={SCALE[2]} />
          </LinearGradient>
        </Defs>
        <Path d="M3 3 H87" stroke="url(#scale)" strokeWidth={6} strokeLinecap="round" />
      </Svg>
      <T v="caption" style={{ fontSize: 11 }}>{high}</T>
    </Row>
  );
}

/** Elevation along the walk as a filled line. `mark` (0–1) shows a position, e.g. the replay marker. */
export function ElevationChart({ profile, width, height = 90, mark }: { profile: { d: number; alt: number }[]; width: number; height?: number; mark?: number }) {
  if (profile.length < 2 || width <= 0) return null;
  const alts = profile.map((p) => p.alt);
  const min = Math.min(...alts);
  const max = Math.max(...alts);
  const range = Math.max(8, max - min); // a flat walk shouldn't look like a mountain
  const total = profile[profile.length - 1].d || 1;
  const x = (d: number) => (d / total) * width;
  const y = (alt: number) => height - 6 - ((alt - min) / range) * (height - 14);
  const top = profile.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)} ${y(p.alt).toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color.volt} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color.volt} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${top} L${width} ${height} L0 ${height} Z`} fill="url(#elev)" />
      <Path d={top} fill="none" stroke={color.volt} strokeWidth={2} strokeLinejoin="round" />
      {mark != null ? <Path d={`M${(mark * width).toFixed(1)} 0 V${height}`} stroke={color.text} strokeWidth={1.5} /> : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  chip: { backgroundColor: 'rgba(7,8,10,0.78)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  turn: { backgroundColor: 'rgba(14,16,19,0.94)', borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: color.voltDim },
  turnIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
