import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { CodeCells, type CodeCellsHandle } from '@/components/ds/CodeCells';
import { Button, Card, Pill, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api, ApiError } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { inviteCodeFromPath } from '@/lib/invite';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, type ChallengeSummary } from '@/shared/contracts';
import { color, space, type } from '@/theme/tokens';

const ALLOWED = new RegExp(`[^${INVITE_CODE_ALPHABET}]`, 'g');

/** Typed characters or a pasted invite link → just the code characters. */
function sanitize(raw: string) {
  const fromLink = raw.includes('/') ? inviteCodeFromPath(raw) : null;
  return (fromLink ?? raw).toUpperCase().replace(ALLOWED, '');
}

/** Join by code: for when someone has the code in hand (a screenshot, a group chat, read aloud). */
export default function EnterCode() {
  const [code, setCode] = useState('');
  const [found, setFound] = useState<ChallengeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cells = useRef<CodeCellsHandle>(null);

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

        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          <View style={{ gap: space.sm }}>
            <T v="title">Have a code?</T>
            <T v="caption">Enter the 6-character code from your invite.</T>
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
            inputProps={{ autoCapitalize: 'characters', autoCorrect: false, keyboardType: 'default', textContentType: 'none' }}
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
                    <T style={[type.num, { fontSize: 22, color: color.gold }]}>
                      {sponsored ? `GH₵${found.sponsor?.prizeValueGhs.toLocaleString()}` : `${found.poolCredits.toLocaleString()} cr`}
                    </T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="label">Entry</T>
                    <T style={[type.num, { fontSize: 18 }]}>{found.entryCredits ? `${found.entryCredits} cr` : 'Free'}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="label">Walking</T>
                    <T style={[type.num, { fontSize: 18 }]}>{found.players}</T>
                  </View>
                </Row>
              </Card>
            </Animated.View>
          ) : null}
        </View>

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
