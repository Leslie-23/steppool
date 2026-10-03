import { router } from 'expo-router';
import { Alert, Platform, ScrollView, View } from 'react-native';

import { Avatar, Button, Card, Press, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { health } from '@/lib/health';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';
import { dailyTarget } from '@/shared/goals';
import { color, space, type } from '@/theme/tokens';

export default function ProfileScreen() {
  const me = useSession((s) => s.me);
  const signOut = useSession((s) => s.signOut);
  const today = useApi(api.today);
  const week = today.data?.week ?? [];
  const target = dailyTarget(me?.baselineDaily ?? 0);
  // Streak: consecutive days on target, counting back from yesterday (today isn't over yet).
  let streak = 0;
  for (let i = week.length - 2; i >= 0 && week[i].steps >= target; i--) streak++;
  const weekTotal = week.reduce((a, d) => a + d.steps, 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 140, gap: space.xl }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', gap: space.md, marginTop: space.xxl }}>
          <Avatar name={me?.name ?? '?'} size={88} ring={color.volt} />
          <T v="title">{me?.name}</T>
          <T v="caption">{me?.email}</T>
        </View>

        <Row gap={space.md}>
          <Stat label="Streak" value={`${streak}d`} icon="flame.fill" tint={color.volt} />
          <Stat label="This week" value={weekTotal.toLocaleString()} icon="figure.walk" />
        </Row>
        <Row gap={space.md}>
          <Stat label="Usual day" value={(me?.baselineDaily ?? 0).toLocaleString()} icon="clock.fill" />
          <Stat label="Daily target" value={target.toLocaleString()} icon="bolt.fill" />
        </Row>

        <Press onPress={() => router.push('/analytics')} accessibilityRole="button" accessibilityLabel="Open analytics">
          <Card tone="volt">
            <Row gap={space.md}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color.voltDim, alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="chart.bar.fill" size={20} color={color.volt} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="heading" style={{ fontSize: 16 }}>Analytics</T>
                <T v="caption">30-day trend, when you walk, streaks and challenge record</T>
              </View>
              <IconSymbol name="chevron.right" size={16} color={color.muted} />
            </Row>
          </Card>
        </Press>

        <Card>
          <Row gap={space.md}>
            <IconSymbol name={Platform.OS === 'ios' ? 'heart.fill' : 'iphone'} size={22} color={color.volt} />
            <View style={{ flex: 1 }}>
              <T v="heading" style={{ fontSize: 15 }}>{Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}</T>
              <T v="caption">Connected · steps only. Manual entries don't count.</T>
            </View>
          </Row>
          {health.openSettings ? (
            <View style={{ marginTop: space.md }}>
              <Button label="Manage permissions" tone="ghost" onPress={() => health.openSettings?.()} />
            </View>
          ) : null}
        </Card>

        <Button
          label="Sign out"
          tone="ghost"
          onPress={() => Alert.alert('Sign out?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }])}
        />
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, icon, tint = color.muted }: { label: string; value: string; icon: Parameters<typeof IconSymbol>[0]['name']; tint?: string }) {
  return (
    <Card style={{ flex: 1, gap: space.sm }}>
      <IconSymbol name={icon} size={18} color={tint} />
      <T style={[type.num, { fontSize: 26 }]}>{value}</T>
      <T v="label">{label}</T>
    </Card>
  );
}
