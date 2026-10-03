import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { Segmented } from '@/components/ds/Segmented';
import { Button, Screen, T } from '@/components/ds/primitives';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { toE164 } from '@/lib/phone';
import { useSession } from '@/lib/session';
import { color, font, radius, space } from '@/theme/tokens';

type Network = 'mtn' | 'telecel' | 'airteltigo';

/** Sponsor prizes go out by MoMo or airtime; we only collect where to send it. */
export default function ClaimPrize() {
  const { payoutId } = useLocalSearchParams<{ payoutId: string }>();
  const me = useSession((s) => s.me);
  const [number, setNumber] = useState(me?.phone?.replace('+233', '0') ?? '');
  const [network, setNetwork] = useState<Network>('mtn');
  const [busy, setBusy] = useState(false);
  const e164 = toE164(number);

  const claim = async () => {
    if (!e164) return;
    setBusy(true);
    try {
      await api.claim(payoutId, { momoNumber: e164, network });
      haptic.success();
      router.back();
    } catch {
      haptic.error();
      setBusy(false);
    }
  };

  return (
    <Screen glow={color.gold}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          <T v="title">Where should we send it?</T>
          <Segmented
            options={[
              { label: 'MTN', value: 'mtn' as const },
              { label: 'Telecel', value: 'telecel' as const },
              { label: 'AirtelTigo', value: 'airteltigo' as const },
            ]}
            value={network}
            onChange={setNetwork}
          />
          <TextInput value={number} onChangeText={setNumber} keyboardType="phone-pad" style={styles.input} selectionColor={color.gold} placeholder="024 123 4567" placeholderTextColor={color.faint} />
          <T v="caption">The sponsor sends prizes within 5 working days. The name on the account should match your StepPool name.</T>
        </View>
        <View style={{ paddingBottom: space.xl }}>
          <Button label={busy ? 'Submitting…' : 'Claim prize'} tone="gold" onPress={claim} disabled={!e164 || busy} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { fontFamily: font.display, fontSize: 26, color: color.text, height: 64, borderRadius: radius.md, backgroundColor: color.surface, paddingHorizontal: space.lg },
});
