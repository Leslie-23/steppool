import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { Segmented } from '@/components/ds/Segmented';
import { Button, Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { toE164 } from '@/lib/phone';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';
import { CASH, ghs } from '@/shared/cash';
import { color, font, radius, space } from '@/theme/tokens';

type Network = 'MTN' | 'VOD' | 'ATL';

/** Sends cash winnings to mobile money through Paystack Transfers. */
export default function Withdraw() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const { data } = useApi(api.cash);
  const [number, setNumber] = useState((data?.momo?.number ?? me?.phone ?? '').replace('+233', '0'));
  const [network, setNetwork] = useState<Network>((data?.momo?.network as Network) ?? 'MTN');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Prefill the last MoMo used once the wallet loads.
  useEffect(() => {
    if (!data?.momo) return;
    setNumber((n) => n || data.momo!.number.replace('+233', '0'));
    setNetwork(data.momo.network as Network);
  }, [data?.momo]);
  const e164 = toE164(number);
  const balance = data?.balance ?? 0;
  const pesewas = Math.round(Number(amount || balance / 100) * 100);
  const valid = !!e164 && pesewas >= CASH.minWithdraw && pesewas <= balance;

  const withdraw = async () => {
    if (!e164) return;
    setBusy(true);
    setError(null);
    try {
      await api.withdraw({ amount: pesewas, momoNumber: e164, network });
      haptic.success();
      api.me().then(setMe).catch(() => {});
      router.back();
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen glow={color.gold}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          <View style={{ gap: space.xs }}>
            <T v="title">Withdraw</T>
            <T v="caption">{ghs(balance)} available. Usually arrives within minutes.</T>
          </View>
          <Segmented
            options={[
              { label: 'MTN', value: 'MTN' as const },
              { label: 'Telecel', value: 'VOD' as const },
              { label: 'AirtelTigo', value: 'ATL' as const },
            ]}
            value={network}
            onChange={setNetwork}
          />
          <TextInput value={number} onChangeText={setNumber} keyboardType="phone-pad" style={styles.input} selectionColor={color.gold} placeholder={data?.momo?.number.replace('+233', '0') ?? '024 123 4567'} placeholderTextColor={color.faint} />
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.input} selectionColor={color.gold} placeholder={`GH₵ ${(balance / 100).toFixed(2)}`} placeholderTextColor={color.faint} />
          <T v="caption">The MoMo account name should match your StepPool name. Minimum {ghs(CASH.minWithdraw)}.</T>
          {error ? <T v="caption" style={{ color: color.danger }}>{error}</T> : null}
        </View>
        <View style={{ paddingBottom: space.xl }}>
          <Button label={busy ? 'Sending…' : `Withdraw ${ghs(Math.max(0, pesewas))}`} tone="gold" onPress={withdraw} disabled={!valid || busy} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { fontFamily: font.display, fontSize: 26, color: color.text, height: 64, borderRadius: radius.md, backgroundColor: color.surface, paddingHorizontal: space.lg },
});
