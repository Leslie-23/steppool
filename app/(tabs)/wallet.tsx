import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Odometer } from '@/components/ds/Odometer';
import { Card, Pill, Press, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EarnAndInvite } from '@/components/wallet/EarnAndInvite';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import type { LedgerLine } from '@/shared/contracts';
import { color, space, type } from '@/theme/tokens';

const LABEL: Record<LedgerLine['kind'], string> = {
  signup_grant: 'Welcome credits',
  entry: 'Challenge entry',
  payout: 'Goal reward',
  refund: 'Refund',
  house_remainder: 'Rounding',
  walk_reward: 'Daily target hit',
  streak_bonus: 'Streak bonus',
  weekly_topup: 'Weekly top-up',
  referral: 'Referral bonus',
  admin_grant: 'Gift from StepPool',
};

export default function WalletScreen() {
  const { data, refresh } = useApi(api.wallet);
  const [pulling, setPulling] = useState(false);
  const claimable = data?.payouts.filter((p) => p.kind === 'sponsor_prize') ?? [];

  return (
    <Screen glow={color.gold}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140, gap: space.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            tintColor={color.gold}
            onRefresh={async () => {
              setPulling(true);
              await refresh();
              setPulling(false);
            }}
          />
        }
      >
        <View style={{ marginTop: space.xxl, alignItems: 'center', gap: space.xs }}>
          <T v="label">Balance</T>
          <Odometer value={data?.balance ?? 0} size={72} color={color.gold} />
          <T v="caption">credits · for challenge entries</T>
        </View>

        <EarnAndInvite onRedeemed={refresh} />

        {claimable.length ? (
          <View style={{ gap: space.md }}>
            <T v="label">Prizes</T>
            {claimable.map((p, i) => (
              <Animated.View key={p.id} entering={FadeInDown.delay(i * 60).springify()}>
                <Press onPress={() => p.status === 'pending' && router.push(`/claim/${p.id}`)}>
                  <Card tone="gold">
                    <Row gap={space.md}>
                      <IconSymbol name="gift.fill" size={26} color={color.gold} />
                      <View style={{ flex: 1 }}>
                        <T v="heading" style={{ fontSize: 15 }}>{p.prizeDescription}</T>
                        <T v="caption">{p.challengeName}</T>
                      </View>
                      <Pill label={p.status === 'pending' ? 'Claim' : p.status === 'claimed' ? 'Processing' : 'Sent'} tone={p.status === 'pending' ? 'gold' : 'muted'} />
                    </Row>
                  </Card>
                </Press>
              </Animated.View>
            ))}
          </View>
        ) : null}

        <View style={{ gap: space.xs }}>
          <T v="label" style={{ marginBottom: space.sm }}>Activity</T>
          {data?.lines.map((l, i) => (
            <Animated.View key={l.id} entering={FadeInDown.delay(Math.min(i, 10) * 40)}>
              <Row style={{ paddingVertical: space.md, borderBottomWidth: 0.5, borderColor: color.hairline }} gap={space.md}>
                <View style={{ flex: 1 }}>
                  <T v="body">{LABEL[l.kind]}</T>
                  <T v="caption">{l.challengeName ?? l.note ?? new Date(l.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</T>
                </View>
                <T style={[type.num, { fontSize: 17, color: l.amount > 0 ? color.gold : color.muted }]}>
                  {l.amount > 0 ? '+' : ''}
                  {l.amount.toLocaleString()}
                </T>
              </Row>
            </Animated.View>
          ))}
        </View>
        <T v="caption" style={{ textAlign: 'center', fontSize: 11 }}>Credits have no cash value and can't be bought or withdrawn.</T>
      </ScrollView>
    </Screen>
  );
}
