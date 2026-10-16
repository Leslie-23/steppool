import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { HoldButton } from '@/components/ds/HoldButton';
import { Card, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { color, space } from '@/theme/tokens';

const GONE: [Parameters<typeof IconSymbol>[0]['name'], string][] = [
  ['person.crop.circle.fill', 'Your profile, name and email'],
  ['figure.walk', 'Your step history and analytics'],
  ['wallet.pass.fill', 'Your credits and unclaimed prizes'],
  ['trophy.fill', 'Your place in challenges that are still running'],
  ['bell.fill', 'Your notifications'],
];

/** In-app account deletion (App Store guideline 5.1.1(v)): explain what goes, then hold to confirm. */
export default function DeleteAccount() {
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      haptic.success();
      await signOut();
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen glow={color.danger}>
      <ScrollView contentContainerStyle={{ gap: space.xl, paddingBottom: space.xxl }}>
        <Row style={{ marginTop: space.sm }}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <IconSymbol name="chevron.left" size={22} color={color.text} />
          </Pressable>
        </Row>
        <View style={{ gap: space.sm }}>
          <T v="title">Delete account</T>
          <T v="caption">This permanently deletes {me?.email ? `the account for ${me.email}` : 'your account'}. It can't be undone.</T>
        </View>

        <Card style={{ gap: space.md }}>
          <T v="label">What gets deleted</T>
          {GONE.map(([icon, text]) => (
            <Row key={text} gap={space.md}>
              <IconSymbol name={icon} size={18} color={color.danger} />
              <T v="body" style={{ flex: 1 }}>{text}</T>
            </Row>
          ))}
        </Card>

        <T v="caption">
          Credits you've already put into a running challenge stay in its pool for the other players. Finished challenge results keep your place as "Deleted walker" so
          everyone else's results don't change. You can sign up again with the same email later, starting fresh.
        </T>

        {error ? (
          <Card>
            <T v="body" style={{ color: color.danger }}>{error}</T>
          </Card>
        ) : null}

        <View style={{ gap: space.md }}>
          <HoldButton label={busy ? 'Deleting…' : 'Hold to delete my account'} holdingLabel="Keep holding to delete" onConfirm={remove} disabled={busy} duration={1500} tone="danger" />
          <T v="caption" style={{ textAlign: 'center' }} onPress={() => router.back()}>
            Keep my account
          </T>
        </View>
      </ScrollView>
    </Screen>
  );
}
