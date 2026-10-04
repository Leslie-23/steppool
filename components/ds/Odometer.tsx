import { memo, useEffect } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { spring } from '@/theme/motion';
import { type } from '@/theme/tokens';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Rolls each digit independently, like a mechanical counter.
 * Columns are keyed from the right so the ones digit never remounts when the number grows.
 */
export function Odometer({ value, size = 64, color, style }: { value: number; size?: number; color?: string; style?: TextStyle }) {
  const text = Math.max(0, Math.round(value)).toLocaleString('en-US');
  const lineHeight = Math.round(size * 1.08);
  const textStyle: TextStyle = { ...type.num, fontSize: size, lineHeight, letterSpacing: -size * 0.04, ...(color ? { color } : null), ...style };
  const chars = text.split('');
  return (
    <View style={styles.row} accessible accessibilityLabel={text}>
      {chars.map((ch, i) => {
        const key = `p${chars.length - i}`;
        return (
          <Animated.View key={key} layout={LinearTransition.springify().damping(20)} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)}>
            {ch === ',' ? (
              <Text allowFontScaling={false} style={[textStyle, { opacity: 0.35 }]}>,</Text>
            ) : (
              <Digit digit={Number(ch)} lineHeight={lineHeight} textStyle={textStyle} delay={(chars.length - i) * 18} />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const Digit = memo(function Digit({ digit, lineHeight, textStyle, delay }: { digit: number; lineHeight: number; textStyle: TextStyle; delay: number }) {
  const y = useSharedValue(-digit * lineHeight);
  useEffect(() => {
    y.value = withDelay(delay, withSpring(-digit * lineHeight, spring.heavy));
  }, [digit, lineHeight, delay, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={anim}>
        {/* Each digit sits in a box of exactly one line. The roll offset is computed from that height,
            so a digit must never be taller than its box: no font scaling, no growth past lineHeight. */}
        {DIGITS.map((d) => (
          <View key={d} style={{ height: lineHeight, justifyContent: 'center' }}>
            <Text allowFontScaling={false} numberOfLines={1} style={textStyle}>
              {d}
            </Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-start' } });
