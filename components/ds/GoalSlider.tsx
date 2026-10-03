import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { haptic } from '@/lib/haptics';
import { spring } from '@/theme/motion';
import { color, radius, space } from '@/theme/tokens';

const THUMB = 30;

/**
 * Snapping drag control. A light tick on every step, a firmer bump on the recommended value
 * (the "detent"), and a thumb that swells while held. −/+ buttons for precise taps and accessibility.
 */
export function GoalSlider({ value, onChange, min, max, step, recommended }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  recommended: number;
}) {
  const [width, setWidth] = useState(0);
  const steps = Math.round((max - min) / step);
  const toIndex = (v: number) => Math.round((v - min) / step);
  const fromIndex = (i: number) => Math.round((min + i * step) * 100) / 100;

  const x = useSharedValue(0); // thumb centre, px along the track
  const held = useSharedValue(0);
  const startX = useSharedValue(0);
  const lastIndex = useRef(toIndex(value));

  // Keep the thumb in sync when the value changes from the buttons or the parent.
  useEffect(() => {
    if (width) x.value = withSpring((toIndex(value) / steps) * width, spring.snappy);
  }, [value, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (i: number) => {
    if (i === lastIndex.current) return;
    lastIndex.current = i;
    if (Math.abs(fromIndex(i) - recommended) < step / 2) haptic.commit();
    else haptic.tick();
    onChange(fromIndex(i));
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      held.value = withSpring(1, spring.snappy);
      // Jump to wherever the finger lands, then drag from there.
      const px = Math.min(Math.max(e.x, 0), width);
      startX.value = px;
      x.value = px;
      scheduleOnRN(emit, Math.round((px / width) * steps));
    })
    .onUpdate((e) => {
      const px = Math.min(Math.max(startX.value + e.translationX, 0), width);
      x.value = px;
      scheduleOnRN(emit, Math.round((px / width) * steps));
    })
    .onFinalize(() => {
      held.value = withSpring(0, spring.snappy);
      // Settle onto the snapped position.
      x.value = withSpring((Math.round((x.value / width) * steps) / steps) * width, spring.snappy);
    });

  const fillStyle = useAnimatedStyle(() => ({ width: x.value }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - THUMB / 2 }, { scale: 1 + held.value * 0.18 }],
    shadowOpacity: 0.35 + held.value * 0.45,
  }));

  const recX = width * ((recommended - min) / (max - min));
  const nudge = (d: number) => {
    const i = Math.min(steps, Math.max(0, toIndex(value) + d));
    emit(i);
  };

  return (
    <View style={styles.row}>
      <Pressable onPress={() => nudge(-1)} hitSlop={10} style={styles.btn} accessibilityLabel="Easier goal" accessibilityRole="button">
        <IconSymbol name="minus" size={16} color={color.text} />
      </Pressable>

      <GestureDetector gesture={pan}>
        <View
          style={styles.hit}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Goal difficulty"
          accessibilityValue={{ text: `${Math.round(value * 100)}% of your usual pace` }}
          onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        >
          <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </View>
          {/* Recommended detent marker. */}
          {width ? (
            <View style={[styles.detent, { left: recX - 1 }]} pointerEvents="none">
              <T v="label" style={styles.detentLabel}>Rec.</T>
            </View>
          ) : null}
          <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none">
            <View style={styles.thumbCore} />
          </Animated.View>
        </View>
      </GestureDetector>

      <Pressable onPress={() => nudge(1)} hitSlop={10} style={styles.btn} accessibilityLabel="Harder goal" accessibilityRole="button">
        <IconSymbol name="plus" size={16} color={color.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  btn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  hit: { flex: 1, height: 48, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: color.raised, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.volt, borderRadius: 4 },
  detent: { position: 'absolute', top: 2, bottom: 2, width: 2, backgroundColor: 'rgba(244,241,234,0.35)', borderRadius: 1, alignItems: 'center' },
  detentLabel: { position: 'absolute', top: -14, width: 40, textAlign: 'center', fontSize: 8, color: color.muted },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: color.text,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.volt,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  thumbCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.volt },
});
