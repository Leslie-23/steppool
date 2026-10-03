import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { StepRing } from '@/components/ds/StepRing';
import { Button, Card, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { health, type HealthAvailability } from '@/lib/health';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { color, space } from '@/theme/tokens';

const POINTS = [
  { icon: 'figure.walk', title: 'Steps only', body: 'We read step counts and which app recorded them. Nothing else.' },
  { icon: 'checkmark.shield.fill', title: 'Verified on our side', body: 'Manual entries and step-faking apps are filtered so every challenge is fair.' },
  { icon: 'lock.fill', title: 'Never sold', body: 'Your health data is used for challenges and nothing else.' },
] as const;

/** Explains why before the OS sheet appears; a cold system prompt gets denied far more often. */
export default function HealthPrimer() {
  const setHealthGranted = useSession((s) => s.setHealthGranted);
  const [availability, setAvailability] = useState<HealthAvailability | null>(null);
  const [demo, setDemo] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    health.availability().then(setAvailability);
    const id = setTimeout(() => setDemo(0.72), 400);
    return () => clearTimeout(id);
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const ok = await health.requestAuth();
      if (ok) {
        haptic.success();
        await setHealthGranted(true);
      } else {
        haptic.error();
      }
    } finally {
      setBusy(false);
    }
  };

  const source = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
        <View style={{ alignItems: 'center' }}>
          <StepRing progress={demo} size={200} stroke={14}>
            <IconSymbol name="heart.fill" size={40} color={color.volt} />
          </StepRing>
        </View>
        <View style={{ gap: space.sm }}>
          <T v="title">Connect {source}</T>
          <T v="caption">StepPool counts the steps your phone or watch already records.</T>
        </View>
        <View style={{ gap: space.sm }}>
          {POINTS.map((p, i) => (
            <Animated.View key={p.title} entering={FadeInDown.delay(200 + i * 90).springify()}>
              <Card style={{ paddingVertical: space.md }}>
                <Row gap={space.md}>
                  <IconSymbol name={p.icon} size={22} color={color.volt} />
                  <View style={{ flex: 1 }}>
                    <T v="heading" style={{ fontSize: 15 }}>{p.title}</T>
                    <T v="caption">{p.body}</T>
                  </View>
                </Row>
              </Card>
            </Animated.View>
          ))}
        </View>
      </View>
      <View style={{ paddingBottom: space.xl, gap: space.md }}>
        {availability === 'needs-install' ? (
          <Button label="Install Health Connect" onPress={() => Linking.openURL('market://details?id=com.google.android.apps.healthdata')} />
        ) : availability === 'unavailable' ? (
          <T v="caption" style={{ textAlign: 'center' }}>Step data isn't available on this device.</T>
        ) : (
          <Button label={busy ? 'Connecting…' : `Connect ${source}`} onPress={connect} disabled={busy || !availability} />
        )}
        {__DEV__ ? <Button label="Skip (dev only)" tone="ghost" onPress={() => setHealthGranted(true)} /> : null}
      </View>
    </Screen>
  );
}
