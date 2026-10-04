import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Pill, Row, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { CASH, ghs } from '@/shared/cash';
import type { CashLine } from '@/shared/contracts';
import { color, space, type } from '@/theme/tokens';

const LABEL: Partial<Record<CashLine['kind'], string>> = {
  deposit: 'Paid in',
  entry: 'Challenge entry',
  payout: 'Winnings',
  refund: 'Returned',
  withdrawal: 'Withdrawn to MoMo',
  withdrawal_reversal: 'Withdrawal returned',
};

/** Real money: balance, a withdraw button and recent movements. Only rendered for users with cash enabled. */
export function CashWallet({ refreshKey }: { refreshKey: number }) {
  const { data } = useApi(api.cash, [refreshKey]);
  if (!data?.enabled) return null;
  const pending = data.withdrawals.filter((w) => w.status === 'pending');
  return (
    <Card tone="gold" style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <T v="label">Cash</T>
          <T style={[type.num, { fontSize: 36, color: color.gold, letterSpacing: -1 }]}>{ghs(data.balance)}</T>
        </View>
        {pending.length ? <Pill label={`${ghs(pending.reduce((s, w) => s + w.amount, 0))} on its way`} tone="muted" /> : null}
      </Row>
      <Button label="Withdraw to MoMo" tone="gold" onPress={() => router.push('/withdraw')} disabled={data.balance < CASH.minWithdraw} />
      {data.lines.slice(0, 5).map((l) => (
        <Row key={l.id} gap={space.md} style={{ paddingTop: space.sm, borderTopWidth: 0.5, borderColor: color.hairline }}>
          <View style={{ flex: 1 }}>
            <T v="body">{LABEL[l.kind] ?? l.kind}</T>
            <T v="caption">{l.challengeName ?? new Date(l.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</T>
          </View>
          <T style={[type.num, { fontSize: 16, color: l.amount > 0 ? color.gold : color.muted }]}>
            {l.amount > 0 ? '+' : '−'}
            {ghs(Math.abs(l.amount))}
          </T>
        </Row>
      ))}
    </Card>
  );
}
