import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { Coin, CoinAmount } from '@/components/ds/Coin';
import { CodeCells, type CodeCellsHandle } from '@/components/ds/CodeCells';
import { Button, Card, Pill, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api, ApiError } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { inviteCodeFromPath } from '@/lib/invite';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, type ChallengeSummary } from '@/shared/contracts';
import { color, space, type } from '@/theme/tokens';

const WHERE = [
  { icon: 'square.and.arrow.up', text: 'On the invite card, under the QR code' },
  { icon: 'link', text: 'At the end of the invite link (…/j/ABC234)' },
  { icon: 'person.2.fill', text: 'Next to the timer on any challenge screen. Ask someone who’s in.' },
] as const;

const ALLOWED = new RegExp(`[^${INVITE_CODE_ALPHABET}]`, 'g');

/** Typed characters or a pasted invite link → just the code characters. */
function sanitize(raw: string) {
  const fromLink = raw.includes('/') ? inviteCodeFromPath(raw) : null;
  return (fromLink ?? raw).toUpperCase().replace(ALLOWED, '');
}

/** Join by code: for when someone has the code in hand (a screenshot, a group chat, read aloud). */
export default function EnterCode() {
  // `steppool://code?c=ABC234` arrives prefilled (e.g. from a link that only carries the code).
  const { c: prefill } = useLocalSearchParams<{ c?: string }>();
  const [code, setCode] = useState(() => (prefill ? sanitize(prefill).slice(0, INVITE_CODE_LENGTH) : ''));
  const [found, setFound] = useState<ChallengeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cells = useRef<CodeCellsHandle>(null);

  // A new link while this screen is already open replaces the code.
  useEffect(() => {
    if (prefill) setCode(sanitize(prefill).slice(0, INVITE_CODE_LENGTH));
  }, [prefill]);

  useEffect(() => {
    if (code.length < INVITE_CODE_LENGTH) {
      setFound(null);
      return;
    }
    setBusy(true);
    setError(null);
    api
      .byCode(code)
      .then((c) => {
        haptic.success();
        // Get the keyboard out of the way so the preview and the join button are fully visible.
        cells.current?.blur();
        Keyboard.dismiss();
        setFound(c);
      })
      .catch((e) => {
        cells.current?.shake();
        setError(e instanceof ApiError && e.status === 404 ? `No challenge with code ${code}` : 'Couldn’t check that code. Try again.');
        setCode('');
      })
      .finally(() => setBusy(false));
  }, [code]);

  const sponsored = found?.kind === 'sponsored';

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Row style={{ justifyContent: 'flex-end', marginTop: space.md }}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
            <IconSymbol name="xmark" size={22} color={color.muted} />
          </Pressable>
        </Row>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space.xl, paddingTop: space.md, paddingBottom: space.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ gap: space.md }}>
            <View style={styles.badge}>
              <IconSymbol name="ticket.fill" size={26} color={color.volt} />
            </View>
            <T v="title">Have a code?</T>
            <T v="body" style={{ color: color.muted }}>
              Enter a challenge's 6-character code to see its prize pool and who's walking, then join in one hold.
            </T>
          </View>

          <CodeCells
            ref={cells}
            value={code}
            onChange={(v) => {
              setError(null);
              setCode(v);
            }}
            length={INVITE_CODE_LENGTH}
            sanitize={sanitize}
            inputProps={{ autoCapitalize: 'characters', autoCorrect: false, keyboardType: 'default', textContentType: 'none', autoFocus: !prefill }}
          />

          <View style={{ minHeight: 24 }}>
            {error ? (
              <Animated.View entering={FadeIn} exiting={FadeOut}>
                <T v="caption" style={{ color: color.danger }}>{error}</T>
              </Animated.View>
            ) : busy ? (
              <T v="caption">Looking it up…</T>
            ) : !found ? (
              <T v="caption" style={{ fontSize: 12 }}>Codes never use 0, O, 1 or I. Pasting the whole invite link works too.</T>
            ) : null}
          </View>

          {found ? (
            <Animated.View entering={FadeInDown.springify()}>
              <Card tone={sponsored ? 'gold' : 'volt'} style={{ gap: space.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Pill label={found.status === 'live' ? 'Live' : found.status === 'upcoming' ? 'Starts soon' : 'Finished'} tone={found.status === 'live' ? 'volt' : 'muted'} />
                  {found.me ? <Pill label="You're in" tone="gold" /> : null}
                </Row>
                <View>
                  <T v="heading">{found.name}</T>
                  {sponsored ? <T v="caption" style={{ color: color.gold }}>Presented by {found.sponsor?.name}</T> : null}
                </View>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View>
                    <T v="label">{sponsored ? 'Prize' : 'Pool'}</T>
                    {sponsored ? (
                      <T style={[type.num, { fontSize: 22, color: color.gold }]}>GH₵{found.sponsor?.prizeValueGhs.toLocaleString()}</T>
                    ) : (
                      <CoinAmount value={found.poolCredits} size={20} />
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="label">Entry</T>
                    {found.entryCredits ? <CoinAmount value={found.entryCredits} tone="silver" size={17} /> : <T style={[type.num, { fontSize: 18 }]}>Free</T>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="label">Walking</T>
                    <T style={[type.num, { fontSize: 18 }]}>{found.players}</T>
                  </View>
                </Row>
              </Card>
            </Animated.View>
          ) : null}
          {!found ? (
            <Card style={{ gap: space.md, paddingVertical: space.md }}>
              <T v="label">Where to find it</T>
              {WHERE.map((w) => (
                <Row key={w.text} gap={space.md} style={{ alignItems: 'flex-start' }}>
                  <IconSymbol name={w.icon} size={16} color={color.volt} />
                  <T v="caption" style={{ flex: 1, color: color.text }}>{w.text}</T>
                </Row>
              ))}
            </Card>
          ) : null}
        </ScrollView>

        <View style={{ paddingBottom: space.xl }}>
          {found ? (
            <Button
              label={found.me ? 'Open challenge' : 'View & join'}
              tone={sponsored ? 'gold' : 'volt'}
              onPress={() => router.replace(`/challenge/${found.id}`)}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { width: 52, height: 52, borderRadius: 16, backgroundColor: color.voltDim, alignItems: 'center', justifyContent: 'center' },
});
