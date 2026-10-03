import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { haptic } from '@/lib/haptics';
import { spring } from '@/theme/motion';
import { color, radius, space } from '@/theme/tokens';

type IconName = Parameters<typeof IconSymbol>[0]['name'];
export const TAB_ICONS: Record<string, IconName> = {
  index: 'figure.walk',
  challenges: 'trophy.fill',
  wallet: 'wallet.pass.fill',
  profile: 'person.crop.circle.fill',
};

/** Floating glass pill; a volt lozenge springs between tabs. */
export function TabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const slot = w / state.routes.length;
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withSpring(state.index * slot, spring.soft);
  }, [state.index, slot, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: slot }));

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, space.md) }]} pointerEvents="box-none">
      <BlurView intensity={50} tint="dark" style={styles.bar} onLayout={(e) => setW(e.nativeEvent.layout.width - space.sm * 2)}>
        <View style={styles.inner}>
          {slot > 0 ? (
            <Animated.View style={[styles.indicatorSlot, pill]}>
              <View style={styles.indicator} />
            </Animated.View>
          ) : null}
          {state.routes.map((route, i) => {
            const focused = state.index === i;
            const { options } = descriptors[route.key];
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={options.title ?? route.name}
                style={styles.item}
                onPress={() => {
                  const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !ev.defaultPrevented) {
                    haptic.select();
                    navigation.navigate(route.name, route.params);
                  }
                }}
              >
                <IconSymbol name={TAB_ICONS[route.name] ?? 'house.fill'} size={22} color={focused ? color.bg : color.muted} />
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.xl, right: space.xl },
  bar: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(14,16,19,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.highlight,
  },
  inner: { flexDirection: 'row', padding: space.sm },
  item: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  indicatorSlot: { position: 'absolute', top: space.sm, bottom: space.sm, left: space.sm, paddingHorizontal: 6 },
  indicator: { flex: 1, borderRadius: radius.pill, backgroundColor: color.volt },
});
