import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Coin } from '@/components/ds/Coin';
import { Card, Row, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { INVITE_CODE_ALPHABET } from '@/shared/contracts';
import { CREDITS } from '@/shared/goals';
import { color, font, radius, space, type } from '@/theme/tokens';

type Icon = Parameters<typeof IconSymbol>[0]['name'];
const WAYS: { icon: Icon; amount: string; text: string }[] = [
  { icon: 'figure.walk', amount: `+${CREDITS.dailyTargetHit}`, text: 'every day you hit your target' },
  { icon: 'flame.fill', amount: `+${CREDITS.streakBonus}`, text: `every ${CREDITS.streakEvery} days in a row` },
  { icon: 'person.2.fill', amount: `+${CREDITS.referral}`, text: 'for you and each friend who joins' },
  { icon: 'clock.fill', amount: `${CREDITS.weeklyFloor}`, text: 'minimum every Monday, topped up for free' },
];

const ALLOWED = new RegExp(`[^${INVITE_CODE_ALPHABET}]`, 'g');

/** How to earn credits, your referral code, and (in your first week) a place to enter a friend's. */
export function EarnAndInvite({ onRedeemed }: { onRedeemed: () => void }) {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Older sessions may predate referral codes; a fresh /me allocates one.
  useEffect(() => {
    if (!me?.referralCode) api.me().then(setMe).catch(() => {});
  }, [me?.referralCode, setMe]);

  const share = () => {
    haptic.commit();
    Share.share({ message: `Walk with me on StepPool. Use my code ${me?.referralCode} when you join and we both get ${CREDITS.referral} credits. https://steppool-api.onrender.com` });
  };

  const redeem = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setMe(await api.redeemReferral(code));
      haptic.success();
      setMsg({ ok: true, text: `+${CREDITS.referral} credits added. Your friend got theirs too.` });
      onRedeemed();
    } catch (e) {
      haptic.error();
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <T v="label">Earn credits</T>
      <Card style={{ gap: space.md }}>
        {WAYS.map((w) => (
          <Row key={w.text} gap={space.md}>
            <View style={styles.icon}>
              <IconSymbol name={w.icon} size={15} color={color.gold} />
            </View>
            <View style={{ width: 70, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Coin size={15} />
              <T style={[type.num, { fontSize: 16 }]}>{w.amount}</T>
            </View>
            <T v="caption" style={{ flex: 1, color: color.text }}>{w.text}</T>
          </Row>
        ))}
      </Card>

      {me?.referralCode ? (
        <Pressable onPress={share} accessibilityRole="button" accessibilityLabel={`Your referral code ${me.referralCode}. Share`}>
          <Card tone="gold">
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <T v="label">Your referral code</T>
                <T style={[type.num, { fontSize: 26, letterSpacing: 4, color: color.gold, marginTop: 2 }]}>{me.referralCode}</T>
              </View>
              <Row gap={6} style={styles.shareBtn}>
                <IconSymbol name="square.and.arrow.up" size={15} color={color.bg} />
                <T style={[type.heading, { fontSize: 14, color: color.bg }]}>Share</T>
              </Row>
            </Row>
          </Card>
        </Pressable>
      ) : null}

      {me?.canRedeemReferral ? (
        <Card style={{ gap: space.sm }}>
          <T v="heading" style={{ fontSize: 15 }}>Joined through a friend?</T>
          <T v="caption">Enter their code in your first week for +{CREDITS.referral} each.</T>
          <Row gap={space.sm} style={{ marginTop: space.xs }}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(ALLOWED, '').slice(0, 6))}
              placeholder="ABC234"
              placeholderTextColor={color.faint}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
              selectionColor={color.gold}
              accessibilityLabel="Friend's referral code"
            />
            <Pressable onPress={redeem} disabled={code.length !== 6 || busy} style={[styles.redeem, { opacity: code.length === 6 && !busy ? 1 : 0.4 }]} accessibilityRole="button">
              <T style={[type.heading, { fontSize: 14, color: color.bg }]}>{busy ? '…' : 'Redeem'}</T>
            </Pressable>
          </Row>
          {msg ? (
            <Animated.View entering={FadeIn}>
              <T v="caption" style={{ color: msg.ok ? color.gold : color.danger }}>{msg.text}</T>
            </Animated.View>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 30, height: 30, borderRadius: 10, backgroundColor: color.goldDim, alignItems: 'center', justifyContent: 'center' },
  shareBtn: { backgroundColor: color.gold, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill },
  input: { flex: 1, height: 48, borderRadius: radius.md, backgroundColor: color.raised, paddingHorizontal: space.lg, fontFamily: font.display, fontSize: 18, letterSpacing: 3, color: color.text },
  redeem: { height: 48, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: color.gold, alignItems: 'center', justifyContent: 'center' },
});
