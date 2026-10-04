import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { color, type } from '@/theme/tokens';

// Rendered from the 3D coin models. Gold = credits you hold or win; silver = credits you spend (entry fees).
const GOLD = require('@/assets/images/coin-gold.png');
const SILVER = require('@/assets/images/coin-silver.png');
const GOLD_SPIN = require('@/assets/images/coin-gold-spin.png');
const SPIN_FRAMES = 36;

export type CoinTone = 'gold' | 'silver';

export function Coin({ tone = 'gold', size = 18 }: { tone?: CoinTone; size?: number }) {
  return <Image source={tone === 'gold' ? GOLD : SILVER} style={{ width: size, height: size }} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" />;
}

/**
 * A credit amount: coin + number. Replaces "120 cr", which read like a currency code.
 * Screen readers hear "120 credits".
 */
export function CoinAmount({ value, tone = 'gold', size = 18, textStyle, sign }: { value: number; tone?: CoinTone; size?: number; textStyle?: TextStyle; sign?: boolean }) {
  const text = `${sign && value > 0 ? '+' : ''}${value.toLocaleString()}`;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${text} credits`}>
      <Coin tone={tone} size={size * 1.05} />
      <Text allowFontScaling={false} style={[type.num, { fontSize: size, lineHeight: Math.ceil(size * 1.2), color: tone === 'gold' ? color.gold : color.text }, textStyle]}>{text}</Text>
    </View>
  );
}

/** A 360° turning gold coin, played from a rendered sprite sheet on the UI thread. */
export function SpinningCoin({ size = 72, duration = 2600 }: { size?: number; duration?: number }) {
  const frame = useSharedValue(0);
  useEffect(() => {
    frame.value = withRepeat(withTiming(SPIN_FRAMES, { duration, easing: Easing.linear }), -1, false);
  }, [frame, duration]);
  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: -Math.floor(frame.value % SPIN_FRAMES) * size }] }));
  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no">
      <Animated.View style={[{ width: size * SPIN_FRAMES, height: size }, strip]}>
        <Image source={GOLD_SPIN} style={{ width: size * SPIN_FRAMES, height: size }} contentFit="fill" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 6 } });
