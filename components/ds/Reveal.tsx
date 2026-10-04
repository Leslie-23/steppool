import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { spring } from '@/theme/motion';

/**
 * Staggered fade-up for list items. Driven by a shared value rather than a layout `entering` animation:
 * those can stay stuck at opacity 0 when a list mounts inside a tab that isn't on screen.
 */
export function Reveal({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(Math.min(index, 8) * 60, withSpring(1, spring.soft));
  }, [index, t]);
  const anim = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 1.2), transform: [{ translateY: (1 - t.value) * 14 }] }));
  return <Animated.View style={[anim, style]}>{children}</Animated.View>;
}
