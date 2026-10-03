import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '@/lib/haptics';
import { spring } from '@/theme/motion';
import { color, radius, type } from '@/theme/tokens';

/**
 * Hold-to-confirm, for anything that spends credits. A fill sweeps across while held,
 * ticking as it goes; release early and it springs back.
 */
export function HoldButton({ label, holdingLabel = 'Keep holding', onConfirm, tone = 'volt', duration = 900, disabled }: {
  label: string;
  holdingLabel?: string;
  onConfirm: () => void;
  tone?: 'volt' | 'gold';
  duration?: number;
  disabled?: boolean;
}) {
  const accent = tone === 'gold' ? color.gold : color.volt;
  const fill = useSharedValue(0);
  const scale = useSharedValue(1);
  const fired = useRef(false);
  const width = useSharedValue(0);
  // The reaction worklet captures `confirm` once, so read the latest callback through a ref.
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const confirm = () => {
    if (fired.current) return;
    fired.current = true;
    haptic.commit();
    onConfirmRef.current();
  };

  useAnimatedReaction(
    () => Math.floor(fill.value * 5),
    (q, prev) => {
      if (prev !== null && q > prev && q < 5) scheduleOnRN(haptic.tick);
      if (q >= 5 && (prev ?? 0) < 5) scheduleOnRN(confirm);
    },
  );

  const fillStyle = useAnimatedStyle(() => ({ width: fill.value * width.value }));
  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const holdingStyle = useAnimatedStyle(() => ({ opacity: fill.value > 0.02 ? 1 : 0 }));
  const idleStyle = useAnimatedStyle(() => ({ opacity: fill.value > 0.02 ? 0 : 1 }));

  return (
    <Pressable
      disabled={disabled}
      onLayout={(e) => (width.value = e.nativeEvent.layout.width)}
      onPressIn={() => {
        fired.current = false;
        scale.value = withSpring(0.98, spring.snappy);
        fill.value = withTiming(1, { duration: duration * (1 - fill.value), easing: Easing.inOut(Easing.quad) });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, spring.snappy);
        if (!fired.current) {
          cancelAnimation(fill);
          fill.value = withSpring(0, spring.soft);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold to confirm"
    >
      <Animated.View style={[styles.wrap, { borderColor: accent, opacity: disabled ? 0.4 : 1 }, wrapStyle]}>
        <Animated.View style={[styles.fill, { backgroundColor: accent }, fillStyle]} />
        <View style={styles.labels}>
          <Animated.Text style={[type.heading, styles.label, { color: accent }, idleStyle]}>{label}</Animated.Text>
          <Animated.Text style={[type.heading, styles.label, styles.overlay, { color: color.bg }, holdingStyle]}>{holdingLabel}</Animated.Text>
        </View>
      </Animated.View>
      <Text style={[type.caption, styles.hint]}>Press and hold</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 60, borderRadius: radius.pill, borderWidth: 1.5, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  labels: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 17 },
  overlay: { position: 'absolute' },
  hint: { textAlign: 'center', marginTop: 8, fontSize: 11 },
});
