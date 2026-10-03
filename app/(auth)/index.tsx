import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Press, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { appleAvailable, Cancelled, googleEnabled, signInWithApple, signInWithGoogle } from '@/lib/oauth';
import { useSession } from '@/lib/session';
import { color, font, radius, space, type } from '@/theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Google's four-colour "G" (brand guidelines require the real mark on a Google button). */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </Svg>
  );
}

export default function SignInScreen() {
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);
  const [apple, setApple] = useState(false);
  const clean = email.trim().toLowerCase();
  const valid = EMAIL.test(clean);

  useEffect(() => {
    appleAvailable().then(setApple).catch(() => setApple(false));
  }, []);

  const withProvider = async (which: 'apple' | 'google') => {
    setBusy(which);
    setError(null);
    try {
      const { tokens, me } = await (which === 'apple' ? signInWithApple() : signInWithGoogle());
      haptic.success();
      await signIn(tokens, me);
    } catch (e) {
      if (!(e instanceof Cancelled)) {
        haptic.error();
        setError((e as Error).message);
      }
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = async () => {
    if (!valid || busy) return;
    setBusy('email');
    setError(null);
    try {
      const { devCode } = await api.requestOtp(clean);
      router.push({ pathname: '/verify', params: { email: clean, devCode: devCode ?? '' } });
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Animated.View entering={FadeInDown.duration(700).springify()}>
            <T v="label" style={{ color: color.volt }}>StepPool</T>
            <T v="hero" style={{ fontSize: 52, lineHeight: 56, marginTop: space.md }}>Walk.{'\n'}Hit your goal.{'\n'}Share the pool.</T>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.delay(150).duration(700).springify()} style={{ gap: space.md, paddingBottom: space.lg }}>
          {apple ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={radius.pill}
              style={[styles.provider, busy && busy !== 'apple' ? { opacity: 0.4 } : null]}
              onPress={() => !busy && withProvider('apple')}
            />
          ) : null}
          {googleEnabled ? (
            <Press onPress={() => !busy && withProvider('google')} style={[styles.provider, styles.google]} accessibilityRole="button" accessibilityLabel="Continue with Google">
              {busy === 'google' ? <ActivityIndicator color={color.text} /> : <GoogleMark />}
              <T style={[type.heading, { fontSize: 17 }]}>Continue with Google</T>
            </Press>
          ) : null}

          {apple || googleEnabled ? (
            <Row gap={space.md} style={{ marginVertical: space.xs }}>
              <View style={styles.rule} />
              <T v="label" style={{ fontSize: 10 }}>or use email</T>
              <View style={styles.rule} />
            </Row>
          ) : null}

          <Row style={styles.field} gap={space.sm}>
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
              maxLength={254}
              style={styles.input}
              selectionColor={color.volt}
              returnKeyType="send"
              onSubmitEditing={submitEmail}
              accessibilityLabel="Email address"
            />
            <Press onPress={submitEmail} disabled={!valid || !!busy} style={[styles.go, { opacity: valid ? 1 : 0.35 }]} accessibilityLabel="Send sign-in code">
              {busy === 'email' ? <ActivityIndicator color={color.bg} /> : <IconSymbol name="arrow.right" size={20} color={color.bg} />}
            </Press>
          </Row>
          {error ? <T v="caption" style={{ color: color.danger }}>{error}</T> : null}
          <T v="caption" style={{ textAlign: 'center', fontSize: 11 }}>Free to play. No deposits, no betting.</T>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  provider: { height: 56, width: '100%' },
  google: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: color.highlight, backgroundColor: color.surface },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  field: { backgroundColor: color.surface, borderRadius: radius.pill, paddingLeft: space.xl, paddingRight: 6, height: 60, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  input: { flex: 1, fontFamily: font.bodyMedium, fontSize: 17, color: color.text },
  go: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center' },
});
