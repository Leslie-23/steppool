import { BlurMask, Canvas, Circle, Group, Path, Skia, SweepGradient, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAnimatedReaction, useDerivedValue, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '@/lib/haptics';
import { spring } from '@/theme/motion';
import { color } from '@/theme/tokens';

/**
 * The hero progress ring: gradient sweep, a glowing tip riding the leading edge,
 * a heavy spring that overshoots and settles, and a haptic tick every 10%.
 * Turns gold at 100%.
 */
export function StepRing({ progress, size = 280, stroke = 18, children }: { progress: number; size?: number; stroke?: number; children?: ReactNode }) {
  const p = useSharedValue(0);
  const done = progress >= 1;
  const accent = done ? color.gold : color.volt;

  useEffect(() => {
    p.value = withDelay(120, withSpring(Math.min(progress, 1), spring.heavy));
  }, [progress, p]);

  useAnimatedReaction(
    () => Math.floor(Math.min(p.value, 1) * 10),
    (step, prev) => {
      if (prev !== null && step > prev) scheduleOnRN(haptic.tick);
    },
  );

  const r = (size - stroke) / 2 - 8;
  const c = size / 2;
  const arc = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(c, c, r);
    return path;
  }, [c, r]);

  // Trim end: clamp slightly above 0 so the round cap still draws at the start.
  const end = useDerivedValue(() => Math.max(0.0001, Math.min(p.value, 1)));
  // The path starts at 3 o'clock; the group rotation moves it to 12, so the tip uses the same frame.
  const tipX = useDerivedValue(() => c + r * Math.cos(end.value * 2 * Math.PI));
  const tipY = useDerivedValue(() => c + r * Math.sin(end.value * 2 * Math.PI));

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group origin={vec(c, c)} transform={[{ rotate: -Math.PI / 2 }]}>
          <Path path={arc} style="stroke" strokeWidth={stroke} color={color.raised} />
          <Path path={arc} style="stroke" strokeWidth={stroke} strokeCap="round" start={0} end={end}>
            <SweepGradient c={vec(c, c)} colors={[`${accent}33`, accent, accent]} positions={[0, 0.7, 1]} />
          </Path>
          <Circle cx={tipX} cy={tipY} r={stroke * 0.9} color={accent} opacity={0.55}>
            <BlurMask blur={14} style="normal" />
          </Circle>
          <Circle cx={tipX} cy={tipY} r={stroke * 0.28} color={color.bg} />
        </Group>
      </Canvas>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
