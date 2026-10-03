import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { T } from '@/components/ds/primitives';
import { spring } from '@/theme/motion';
import { color, space } from '@/theme/tokens';

const H = 72;

/** Seven bars that rise in sequence; days at or over target glow volt, today is outlined. */
export function WeekBars({ week, target }: { week: { day: string; steps: number }[]; target: number }) {
  const max = Math.max(target * 1.2, ...week.map((d) => d.steps));
  return (
    <View style={styles.row}>
      {week.map((d, i) => (
        <Bar key={d.day} label={new Date(d.day).toLocaleDateString('en-GB', { weekday: 'narrow' })} ratio={d.steps / max} hit={d.steps >= target} today={i === week.length - 1} delay={i * 60} />
      ))}
      <View style={[styles.targetLine, { bottom: 18 + (target / max) * H }]} pointerEvents="none" />
    </View>
  );
}

function Bar({ label, ratio, hit, today, delay }: { label: string; ratio: number; hit: boolean; today: boolean; delay: number }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(delay, withSpring(Math.max(4, ratio * H), spring.soft));
  }, [ratio, delay, h]);
  const anim = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <View style={styles.col}>
      <View style={{ height: H, justifyContent: 'flex-end' }}>
        <Animated.View style={[styles.bar, { backgroundColor: hit ? color.volt : 'rgba(244,241,234,0.16)' }, today && styles.today, anim]} />
      </View>
      <T v="label" style={{ fontSize: 10, color: today ? color.text : color.faint }}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  bar: { width: '100%', borderRadius: 6 },
  today: { borderWidth: 1, borderColor: color.volt },
  targetLine: { position: 'absolute', left: 0, right: 0, height: 1, borderStyle: 'dashed', borderWidth: 0.5, borderColor: color.faint },
});
