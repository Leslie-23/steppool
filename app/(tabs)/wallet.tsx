import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { CoinAmount, SpinningCoin } from '@/components/ds/Coin';
import { EmptyState, ErrorState } from '@/components/ds/EmptyState';
import { Odometer } from '@/components/ds/Odometer';
import { Reveal } from '@/components/ds/Reveal';
import { ListSkeleton, Skeleton } from '@/components/ds/Skeleton';
import { Card, Pill, Press, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CashWallet } from '@/components/cash/CashWallet';
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
  deposit: 'Paid in',
  rake: 'StepPool fee',
  withdrawal: 'Withdrawal',
  withdrawal_reversal: 'Withdrawal returned',
  // Sponsor-money kinds never touch a player's credit wallet; listed so the map stays complete.
  sponsor_fund: 'Sponsor prize',
  sponsor_fee: 'Sponsor fee',
  prize_payout: 'Prize sent',
  prize_payout_reversal: 'Prize returned',
};

export default function WalletScreen() {
  const { data, refresh, loading, error } = useApi(api.wallet, [], 'wallet');
  const [pulling, setPulling] = useState(false);
  const [cashKey, setCashKey] = useState(0);
  // Coming back from a withdrawal or a challenge should show the new cash balance.
  useFocusEffect(useCallback(() => setCashKey((k) => k + 1), []));
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
              setCashKey((k) => k + 1);
              await refresh();
              setPulling(false);
            }}
          />
        }
      >
        <View style={{ marginTop: space.xxl, alignItems: 'center', gap: space.xs }}>
          <SpinningCoin size={84} />
          <T v="label" style={{ marginTop: space.sm }}>Balance</T>
          {loading ? <Skeleton w={160} h={64} r={14} style={{ marginVertical: 8 }} /> : <Odometer value={data?.balance ?? 0} size={72} color={color.gold} />}
          <T v="caption">credits to enter challenges with</T>
        </View>

        <CashWallet refreshKey={cashKey} />

        <EarnAndInvite onRedeemed={refresh} />

        {claimable.length ? (
          <View style={{ gap: space.md }}>
            <T v="label">Prizes</T>
            {claimable.map((p, i) => (
              <Reveal key={p.id} index={i}>
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
              </Reveal>
            ))}
          </View>
        ) : null}

        <View style={{ gap: space.xs }}>
          <T v="label" style={{ marginBottom: space.sm }}>Activity</T>
          {loading ? <ListSkeleton /> : null}
          {error && !data ? <ErrorState onRetry={refresh} message={error.message} /> : null}
          {data && !data.lines.length ? (
            <EmptyState
              icon="figure.walk"
              tint={color.gold}
              title="No activity yet"
              body="Hit your daily target to earn your first +20 credits. Keep it up 7 days in a row for +100 more."
            />
          ) : null}
          {data?.lines.map((l, i) => (
            <Reveal key={l.id} index={i}>
              <Row style={{ paddingVertical: space.md, borderBottomWidth: 0.5, borderColor: color.hairline }} gap={space.md}>
                <View style={{ flex: 1 }}>
                  <T v="body">{LABEL[l.kind]}</T>
                  <T v="caption">{l.challengeName ?? l.note ?? new Date(l.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</T>
                </View>
                <CoinAmount value={l.amount} tone={l.amount > 0 ? 'gold' : 'silver'} size={16} sign textStyle={l.amount > 0 ? undefined : { color: color.muted }} />
              </Row>
            </Reveal>
          ))}
        </View>
        <T v="caption" style={{ textAlign: 'center', fontSize: 11 }}>Credits have no cash value and can't be bought or withdrawn.</T>
      </ScrollView>
    </Screen>
  );
}
