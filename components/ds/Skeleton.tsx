import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Card, Row } from '@/components/ds/primitives';
import { color, radius, space } from '@/theme/tokens';

/** A placeholder block with a soft light sweeping across it. */
export function Skeleton({ w = '100%', h = 14, r = 8, style }: { w?: DimensionValue; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [x]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: -width + x.value * width * 2 }] }));
  return (
    <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: color.raised, overflow: 'hidden' }, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.07)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Shaped like a ChallengeCard. */
export function ChallengeCardSkeleton() {
  return (
    <Card style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Skeleton w={64} h={20} r={radius.pill} />
        <Skeleton w={80} h={12} />
      </Row>
      <Skeleton w="70%" h={22} />
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <View style={{ gap: 6 }}>
          <Skeleton w={40} h={10} />
          <Skeleton w={90} h={22} />
        </View>
        <View style={{ gap: 6, alignItems: 'flex-end' }}>
          <Skeleton w={40} h={10} />
          <Skeleton w={60} h={18} />
        </View>
      </Row>
      <Skeleton h={6} r={3} />
    </Card>
  );
}

/** Rows like the wallet's activity list. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View>
      {Array.from({ length: rows }, (_, i) => (
        <Row key={i} gap={space.md} style={{ paddingVertical: space.md, borderBottomWidth: 0.5, borderColor: color.hairline }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton w={`${55 - i * 6}%`} h={14} />
            <Skeleton w={80} h={10} />
          </View>
          <Skeleton w={56} h={16} />
        </Row>
      ))}
    </View>
  );
}
