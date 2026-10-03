import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Row, T } from '@/components/ds/primitives';
import { haptic } from '@/lib/haptics';
import { color, space, type } from '@/theme/tokens';

const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
const hourLong = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString('en-GB', { hour: 'numeric', hour12: true });

/**
 * When you walk: 24 cells, one sequential hue (volt), dim → bright with volume.
 * `hourlyUtc` is indexed by UTC hour; cells are shown in the phone's local time.
 */
export function HourStrip({ hourlyUtc }: { hourlyUtc: number[] }) {
  const offsetH = -new Date().getTimezoneOffset() / 60; // Accra is 0
  const local = Array.from({ length: 24 }, (_, h) => hourlyUtc[(((h - offsetH) % 24) + 24) % 24] ?? 0);
  const max = Math.max(1, ...local);
  const peak = local.indexOf(Math.max(...local));
  const [selected, setSelected] = useState<number | null>(null);
  const shown = selected ?? peak;

  return (
    <View accessible accessibilityLabel={`You walk most around ${hourLong(peak)}, averaging ${local[peak].toLocaleString()} steps in that hour.`}>
      <Row gap={space.sm} style={{ alignItems: 'baseline', marginBottom: space.md }}>
        <T style={[type.num, { fontSize: 22 }]}>{local[shown].toLocaleString()}</T>
        <T v="caption">avg steps · {hourLong(shown)}{selected === null ? ' (your peak)' : ''}</T>
      </Row>
      <View style={styles.strip}>
        {local.map((v, h) => {
          // Sequential: a floor keeps empty hours visible as cells; sqrt spreads the low end.
          const a = v === 0 ? 0.05 : 0.14 + 0.86 * Math.sqrt(v / max);
          return (
            <Pressable
              key={h}
              style={[styles.cell, { backgroundColor: `rgba(215,255,58,${a.toFixed(3)})` }, h === shown && styles.selected]}
              onPress={() => {
                haptic.select();
                setSelected((s) => (s === h ? null : h));
              }}
              accessibilityLabel={`${hourLong(h)}: ${v.toLocaleString()} steps on average`}
            />
          );
        })}
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
        {[0, 6, 12, 18, 23].map((h) => (
          <T key={h} v="caption" style={{ fontSize: 11, color: color.faint }}>{hourLabel(h)}</T>
        ))}
      </Row>
      <Row gap={6} style={{ marginTop: space.md }}>
        <T v="caption" style={{ fontSize: 11 }}>Less</T>
        {[0.14, 0.4, 0.7, 1].map((a) => (
          <View key={a} style={[styles.key, { backgroundColor: `rgba(215,255,58,${a})` }]} />
        ))}
        <T v="caption" style={{ fontSize: 11 }}>More</T>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 2, height: 40 },
  cell: { flex: 1, borderRadius: 4 },
  selected: { borderWidth: 1.5, borderColor: color.text },
  key: { width: 14, height: 10, borderRadius: 3 },
});
