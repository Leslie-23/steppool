import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { GoalSlider } from '@/components/ds/GoalSlider';
import { Odometer } from '@/components/ds/Odometer';
import { Button, Card, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { CREDITS, dailyTarget, MAX_CUSTOM_DAILY, MIN_CUSTOM_DAILY } from '@/shared/goals';
import { color, space } from '@/theme/tokens';

/** Set your own daily target. Drives Today's ring, streaks and daily credit rewards; challenge goals stay rule-based. */
export default function TargetSettings() {
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const recommended = dailyTarget(me?.baselineDaily ?? 0);
  const [value, setValue] = useState(me?.dailyTarget ?? recommended);
  const [busy, setBusy] = useState(false);
  const changed = value !== (me?.dailyTarget ?? recommended);
  const minutes = Math.round(value / 110); // ~110 steps per minute of brisk walking

  const save = async (next: number | null) => {
    setBusy(true);
    try {
      setMe(await api.updateMe({ dailyTarget: next }));
      haptic.success();
      router.back();
    } catch {
      haptic.error();
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Row style={{ marginTop: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <IconSymbol name="chevron.left" size={22} color={color.text} />
        </Pressable>
      </Row>
      <ScrollView contentContainerStyle={{ gap: space.xl, paddingBottom: space.xxxl }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <T v="title">Your daily target</T>
          <T v="body" style={{ color: color.muted }}>
            Hit it to keep your streak and earn +{CREDITS.dailyTargetHit} credits a day. Challenge goals are set separately so pools stay fair.
          </T>
        </View>

        <Card tone="volt" style={{ gap: space.lg, paddingVertical: space.xl }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Odometer value={value} size={56} />
            <T v="caption">steps a day · about {minutes} min of brisk walking</T>
          </View>
          <GoalSlider value={value} onChange={setValue} min={MIN_CUSTOM_DAILY} max={MAX_CUSTOM_DAILY} step={500} recommended={recommended} />
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="caption" style={{ fontSize: 11 }}>{MIN_CUSTOM_DAILY.toLocaleString()}</T>
            <T v="caption" style={{ fontSize: 11 }}>Recommended {recommended.toLocaleString()}</T>
            <T v="caption" style={{ fontSize: 11 }}>{MAX_CUSTOM_DAILY.toLocaleString()}</T>
          </Row>
        </Card>

        <View style={{ gap: space.md }}>
          <Button label={busy ? 'Saving…' : 'Save target'} onPress={() => save(value)} disabled={!changed || busy} />
          {me?.dailyTargetCustom ? (
            <Button label={`Use recommended (${recommended.toLocaleString()})`} tone="ghost" onPress={() => save(null)} disabled={busy} />
          ) : null}
          <T v="caption" style={{ textAlign: 'center', fontSize: 11 }}>Recommended is your usual day +15%, and updates as you walk.</T>
        </View>
      </ScrollView>
    </Screen>
  );
}
