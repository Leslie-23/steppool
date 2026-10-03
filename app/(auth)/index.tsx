import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Row, Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { color, font, radius, space } from '@/theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function EmailScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = email.trim().toLowerCase();
  const valid = EMAIL.test(clean);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const { devCode } = await api.requestOtp(clean);
      router.push({ pathname: '/verify', params: { email: clean, devCode: devCode ?? '' } });
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.xxl }}>
          <Animated.View entering={FadeInDown.duration(700).springify()}>
            <T v="label" style={{ color: color.volt }}>StepPool</T>
            <T v="hero" style={{ fontSize: 52, lineHeight: 54, marginTop: space.md }}>Walk.{'\n'}Hit your goal.{'\n'}Share the pool.</T>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(150).duration(700).springify()} style={{ gap: space.md }}>
            <T v="label">Your email</T>
            <Row style={styles.field} gap={space.md}>
              <TextInput
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError(null);
                }}
                placeholder="you@example.com"
                placeholderTextColor={color.faint}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={254}
                style={styles.input}
                selectionColor={color.volt}
                onSubmitEditing={submit}
              />
            </Row>
            {error ? <T v="caption" style={{ color: color.danger }}>{error}</T> : null}
          </Animated.View>
        </View>
        <View style={{ paddingBottom: space.xl, gap: space.md }}>
          <Button label={busy ? 'Sending code…' : 'Continue'} onPress={submit} disabled={!valid || busy} />
          <T v="caption" style={{ textAlign: 'center', fontSize: 11 }}>Free to play. No deposits, no betting.</T>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { backgroundColor: color.surface, borderRadius: radius.md, paddingHorizontal: space.lg, height: 64, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  input: { flex: 1, fontFamily: font.displayMedium, fontSize: 20, color: color.text },
});
