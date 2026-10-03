import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Row, Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { toE164 } from '@/lib/phone';
import { color, font, radius, space } from '@/theme/tokens';

export default function PhoneScreen() {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e164 = toE164(phone);

  const submit = async () => {
    if (!e164) return;
    setBusy(true);
    setError(null);
    try {
      const { devCode } = await api.requestOtp(e164);
      router.push({ pathname: '/verify', params: { phone: e164, devCode: devCode ?? '' } });
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
            <T v="label">Your phone number</T>
            <Row style={styles.field} gap={space.md}>
              <T v="heading" style={{ color: color.muted }}>🇬🇭 +233</T>
              <TextInput
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  setError(null);
                }}
                placeholder="24 123 4567"
                placeholderTextColor={color.faint}
                keyboardType="phone-pad"
                autoFocus
                maxLength={13}
                style={styles.input}
                selectionColor={color.volt}
                onSubmitEditing={submit}
              />
            </Row>
            {error ? <T v="caption" style={{ color: color.danger }}>{error}</T> : null}
          </Animated.View>
        </View>
        <View style={{ paddingBottom: space.xl, gap: space.md }}>
          <Button label={busy ? 'Sending code…' : 'Continue'} onPress={submit} disabled={!e164 || busy} />
          <T v="caption" style={{ textAlign: 'center', fontSize: 11 }}>Free to play. No deposits, no betting.</T>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { backgroundColor: color.surface, borderRadius: radius.md, paddingHorizontal: space.lg, height: 64, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  input: { flex: 1, fontFamily: font.display, fontSize: 24, color: color.text, letterSpacing: 1 },
});
