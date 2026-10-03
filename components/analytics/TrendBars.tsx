import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { Row, T } from '@/components/ds/primitives';
import { haptic } from '@/lib/haptics';
import { spring } from '@/theme/motion';
import { color, space, type } from '@/theme/tokens';

const H = 150;
const GAP = 2; // surface gap between adjacent bars
const UNDER = 'rgba(244,241,234,0.22)';

const fmtDay = (iso: string, long = false) =>
  new Date(iso).toLocaleDateString('en-GB', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });

/**
 * 30-day daily steps. One series, so no legend: volt = on target, neutral = under.
 * Tap a bar to read its exact value (the native stand-in for a hover tooltip).
 */
export function TrendBars({ days, target }: { days: { day: string; steps: number }[]; target: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(target * 1.15, ...days.map((d) => d.steps), 1);
  const targetY = (target / max) * H;
  const sel = selected === null ? null : days[selected];

  return (
    <View accessible accessibilityLabel={`Daily steps for the last ${days.length} days. Target ${target.toLocaleString()} steps.`}>
      {/* Readout: the selected day, or a prompt. Fixed height so the chart never jumps. */}
      <View style={styles.readout}>
        {sel ? (
          <Row gap={space.sm} style={{ alignItems: 'baseline' }}>
            <T style={[type.num, { fontSize: 22 }]}>{sel.steps.toLocaleString()}</T>
            <T v="caption">steps · {fmtDay(sel.day, true)}</T>
            {sel.steps >= target ? <T v="caption" style={{ color: color.volt }}>on target</T> : null}
          </Row>
        ) : (
          <T v="caption">Tap a bar for the exact count</T>
        )}
      </View>

      <View style={{ height: H }}>
        <View style={[styles.targetLine, { bottom: targetY }]} pointerEvents="none" />
        <T v="label" style={[styles.targetLabel, { bottom: targetY + 4 }]}>Target {target.toLocaleString()}</T>
        <View style={styles.bars}>
          {days.map((d, i) => (
            <Bar
              key={d.day}
              height={(d.steps / max) * H}
              hit={d.steps >= target}
              dim={selected !== null && selected !== i}
              delay={i * 18}
              onPress={() => {
                haptic.select();
                setSelected((s) => (s === i ? null : i));
              }}
              label={`${fmtDay(d.day, true)}: ${d.steps.toLocaleString()} steps`}
            />
          ))}
        </View>
      </View>

      <View style={styles.axis} />
      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <T v="caption" style={styles.tick}>{fmtDay(days[0]?.day ?? '')}</T>
        <T v="caption" style={styles.tick}>{fmtDay(days[Math.floor(days.length / 2)]?.day ?? '')}</T>
        <T v="caption" style={styles.tick}>Today</T>
      </Row>
    </View>
  );
}

function Bar({ height, hit, dim, delay, onPress, label }: { height: number; hit: boolean; dim: boolean; delay: number; onPress: () => void; label: string }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(delay, withSpring(Math.max(height, 2), spring.soft));
  }, [height, delay, h]);
  const anim = useAnimatedStyle(() => ({ height: h.value }));
  return (
    // Hit target is the full column height, much bigger than a thin bar.
    <Pressable onPress={onPress} style={styles.col} accessibilityRole="button" accessibilityLabel={label} hitSlop={{ top: 8, bottom: 8 }}>
      <Animated.View style={[styles.bar, { backgroundColor: hit ? color.volt : UNDER, opacity: dim ? 0.35 : 1 }, anim]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  readout: { height: 30, justifyContent: 'center', marginBottom: space.sm },
  bars: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'flex-end', gap: GAP },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  // 4px rounded data-end at the top, square where the bar meets the baseline.
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  targetLine: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: color.faint },
  targetLabel: { position: 'absolute', right: 0, fontSize: 9, color: color.muted },
  axis: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  tick: { fontSize: 11, color: color.faint },
});
