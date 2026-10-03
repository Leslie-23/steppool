import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { spring } from '@/theme/motion';
import { color, radius, space, type } from '@/theme/tokens';

type Variant = keyof typeof type;

export function T({ v = 'body', style, ...rest }: TextProps & { v?: Variant }) {
  const flat = StyleSheet.flatten([type[v], style]) as TextStyle;
  // A line box shorter than the font clips glyph tops on iOS. That happens when a caller bumps fontSize
  // but inherits a variant's smaller lineHeight (body is 22), so never let it drop below what the size needs.
  const lineHeight = flat.fontSize ? Math.max(flat.lineHeight ?? 0, Math.ceil(flat.fontSize * 1.2)) : flat.lineHeight;
  return <Text {...rest} style={[flat, lineHeight ? { lineHeight } : null]} />;
}

/** Full-bleed screen with the ambient top glow. Every screen sits on this. */
export function Screen({ children, glow = color.volt, padded = true }: { children: ReactNode; glow?: string; padded?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[`${glow}1F`, `${glow}00`]}
        style={styles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />
      <View style={{ flex: 1, paddingTop: insets.top, paddingHorizontal: padded ? space.lg : 0 }}>{children}</View>
    </View>
  );
}

/** Raised surface with a 1px inner top highlight. `glass` floats it over content. */
export function Card({ children, style, glass, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; glass?: boolean; tone?: 'gold' | 'volt' }) {
  const border = tone === 'gold' ? color.goldDim : tone === 'volt' ? color.voltDim : color.hairline;
  if (glass) {
    return (
      <BlurView intensity={40} tint="dark" style={[styles.card, { borderColor: border, backgroundColor: 'rgba(14,16,19,0.55)' }, style]}>
        <View style={styles.highlight} />
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[styles.card, { borderColor: border }, style]}>
      <View style={styles.highlight} />
      {children}
    </View>
  );
}

/** Pressable that compresses on touch with a snappy spring. */
export function Press({ children, style, onPressIn, onPressOut, scaleTo = 0.97, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; children: ReactNode }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        s.value = withSpring(scaleTo, spring.snappy);
        haptic.select();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, spring.snappy);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[anim, style]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({ label, onPress, tone = 'volt', disabled }: { label: string; onPress: () => void; tone?: 'volt' | 'ghost' | 'gold'; disabled?: boolean }) {
  const bg = tone === 'volt' ? color.volt : tone === 'gold' ? color.gold : 'transparent';
  const fg = tone === 'ghost' ? color.text : color.bg;
  return (
    <Press onPress={onPress} disabled={disabled} style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }, tone === 'ghost' && styles.ghost]}>
      <Text style={[type.heading, { color: fg, fontSize: 16 }]}>{label}</Text>
    </Press>
  );
}

export function Pill({ label, tone }: { label: string; tone?: 'volt' | 'gold' | 'muted' }) {
  const fg = tone === 'volt' ? color.volt : tone === 'gold' ? color.gold : color.muted;
  const bg = tone === 'volt' ? color.voltDim : tone === 'gold' ? color.goldDim : color.raised;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[type.label, { color: fg, fontSize: 10 }]}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 36, ring }: { name: string; size?: number; ring?: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  // Stable hue per name so avatars stay recognisable across screens.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsl(${h}, 22%, 22%)`,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}
    >
      <Text style={[type.label, { color: color.text, letterSpacing: 0.5, fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    overflow: 'hidden',
  },
  highlight: { position: 'absolute', top: 0, left: space.lg, right: space.lg, height: 1, backgroundColor: color.highlight },
  button: { height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  ghost: { borderWidth: 1, borderColor: color.hairline },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
});
