import type React from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { T } from '@/components/ds/primitives';
import { haptic } from '@/lib/haptics';
import { spring } from '@/theme/motion';
import { color, radius } from '@/theme/tokens';

/** Segmented control with a sliding thumb. */
export function Segmented<V extends string | number>({ options, value, onChange }: { options: { label: string; value: V; icon?: React.ReactNode }[]; value: V; onChange: (v: V) => void }) {
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const slot = w / options.length;
  const thumb = useAnimatedStyle(() => ({ width: slot, transform: [{ translateX: withSpring(idx * slot, spring.snappy) }] }));
  return (
    <View style={styles.wrap} onLayout={(e) => setW(e.nativeEvent.layout.width - 8)}>
      {w ? <Animated.View style={[styles.thumb, thumb]} /> : null}
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          style={styles.item}
          onPress={() => {
            if (o.value !== value) haptic.select();
            onChange(o.value);
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {o.icon}
            <T v="heading" style={{ fontSize: 14, color: o.value === value ? color.bg : color.muted }}>{o.label}</T>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: color.surface, borderRadius: radius.pill, padding: 4 },
  thumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.pill, backgroundColor: color.volt },
  item: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
});
