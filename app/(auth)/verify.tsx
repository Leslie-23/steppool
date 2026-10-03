import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { spring } from '@/theme/motion';
import { color, radius, space, type } from '@/theme/tokens';

const LEN = 6;

export default function VerifyScreen() {
  const { email, devCode } = useLocalSearchParams<{ email: string; devCode?: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<TextInput>(null);
  const shake = useSharedValue(0);
  const signIn = useSession((s) => s.signIn);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (code.length !== LEN || busy) return;
    setBusy(true);
    api
      .verifyOtp(email, code)
      .then(async ({ tokens, me }) => {
        haptic.success();
        await signIn(tokens, me);
      })
      .catch(() => {
        haptic.error();
        shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }), withTiming(-6, { duration: 50 }), withSpring(0, spring.snappy));
        setCode('');
      })
      .finally(() => setBusy(false));
  }, [code, busy, email, signIn, shake]);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xxl }}>
        <View style={{ gap: space.sm }}>
          <T v="title">Enter the code</T>
          <T v="caption">Sent to {email}. Check spam if it isn't there in a minute.</T>
          {devCode ? <T v="caption" style={{ color: color.volt }}>Dev code: {devCode}</T> : null}
        </View>
        <Pressable onPress={() => input.current?.focus()}>
          <Animated.View style={[styles.cells, shakeStyle]}>
            {Array.from({ length: LEN }, (_, i) => (
              <Cell key={i} char={code[i]} active={i === code.length} />
            ))}
          </Animated.View>
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(t) => {
            const next = t.replace(/\D/g, '').slice(0, LEN);
            if (next.length > code.length) haptic.tick();
            setCode(next);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          style={styles.hidden}
        />
        <Pressable onPress={() => router.back()}>
          <T v="caption" style={{ textAlign: 'center' }}>Wrong email? Go back</T>
        </Pressable>
      </View>
    </Screen>
  );
}

function Cell({ char, active }: { char?: string; active: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (char) s.value = withSequence(withTiming(1.12, { duration: 80 }), withSpring(1, spring.snappy));
  }, [char, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.cell, active && { borderColor: color.volt }, char ? { backgroundColor: color.raised } : null, anim]}>
      <T style={[type.num, { fontSize: 28 }]}>{char ?? ''}</T>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: {
    width: 50,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
