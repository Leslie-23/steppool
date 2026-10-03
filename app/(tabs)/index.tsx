import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChallengeCard } from '@/components/arena/ChallengeCard';
import { WeekBars } from '@/components/arena/WeekBars';
import { Odometer } from '@/components/ds/Odometer';
import { StepRing } from '@/components/ds/StepRing';
import { Avatar, Card, Press, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { pendingInvite } from '@/lib/invite';
import { useSession } from '@/lib/session';
import { syncSteps } from '@/lib/sync';
import { useApi } from '@/lib/useApi';
import { updateWidget } from '@/lib/widget';
import { dailyTarget } from '@/shared/goals';
import { color, space, type } from '@/theme/tokens';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function TodayScreen() {
  const me = useSession((s) => s.me);
  const today = useApi(api.today);
  const lobby = useApi(api.challenges);
  const live = lobby.data?.mine.filter((c) => c.status === 'live') ?? [];
  const focus = live[0];
  const board = useApi(() => (focus ? api.leaderboard(focus.id) : Promise.resolve([])), [focus?.id]);
  const [pulling, setPulling] = useState(false);

  // Resume an invite link that was opened before sign-in.
  useEffect(() => {
    pendingInvite.take().then((code) => code && router.push(`/join/${code}`));
  }, []);

  const steps = today.data?.steps ?? 0;
  const target = dailyTarget(today.data?.baselineDaily ?? me?.baselineDaily ?? 0);

  // "Beat me": the person directly above you, and exactly how far.
  const rows = board.data ?? [];
  const mine = rows.findIndex((r) => r.userId === me?.id);
  const above = mine > 0 ? rows[mine - 1] : undefined;
  const gap = above && mine >= 0 ? above.steps - rows[mine].steps + 1 : 0;

  useEffect(() => {
    if (!today.data) return;
    updateWidget({ steps, target, challenge: focus?.name, rank: mine >= 0 ? rows[mine].rank : undefined, gapToNext: above ? gap : undefined, nextName: above?.name.split(' ')[0] });
  }, [today.data, steps, target, focus?.name, mine, rows, above, gap]);

  const onRefresh = async () => {
    setPulling(true);
    await syncSteps().catch(() => {});
    await Promise.all([today.refresh(), lobby.refresh(), board.refresh()]);
    setPulling(false);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140, gap: space.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={color.volt} />}
      >
        <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
          <View>
            <T v="caption">{greeting()}</T>
            <T v="heading">{me?.name}</T>
          </View>
          <Press onPress={() => router.push('/(tabs)/profile')}>
            <Avatar name={me?.name ?? '?'} size={40} />
          </Press>
        </Row>

        <View style={{ alignItems: 'center' }}>
          <StepRing progress={steps / target} size={300}>
            <T v="label">Today</T>
            <Odometer value={steps} size={56} color={steps >= target ? color.gold : undefined} />
            <T v="caption">of {target.toLocaleString()}</T>
          </StepRing>
        </View>

        {above ? (
          <Animated.View entering={FadeInDown.springify()}>
            <Press onPress={() => router.push(`/challenge/${focus!.id}`)}>
              <Card tone="volt">
                <Row gap={space.md}>
                  <Avatar name={above.name} size={44} ring={color.volt} />
                  <View style={{ flex: 1 }}>
                    <T v="label" style={{ color: color.volt }}>Beat {above.name.split(' ')[0]}</T>
                    <T style={[type.num, { fontSize: 26, marginTop: 2 }]}>
                      {gap.toLocaleString()} <T v="caption">steps to #{above.rank}</T>
                    </T>
                    <T v="caption">≈ {Math.max(1, Math.round(gap / 110))} min brisk walk</T>
                  </View>
                  <IconSymbol name="arrow.up.right" size={18} color={color.volt} />
                </Row>
              </Card>
            </Press>
          </Animated.View>
        ) : null}

        {today.data?.week?.length ? (
          <Card>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
              <T v="label">This week</T>
              <T v="caption">{today.data.week.filter((d) => d.steps >= target).length}/7 days on target</T>
            </Row>
            <WeekBars week={today.data.week} target={target} />
          </Card>
        ) : null}

        <View style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="label">Your challenges</T>
            <Press onPress={() => router.push('/(tabs)/challenges')}>
              <T v="caption" style={{ color: color.volt }}>Browse</T>
            </Press>
          </Row>
          {live.length ? (
            live.map((c, i) => (
              <Animated.View key={c.id} entering={FadeInDown.delay(i * 70).springify()}>
                <ChallengeCard c={c} />
              </Animated.View>
            ))
          ) : (
            <Press onPress={() => router.push('/(tabs)/challenges')}>
              <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.sm }}>
                <IconSymbol name="trophy.fill" size={28} color={color.faint} />
                <T v="heading" style={{ fontSize: 16 }}>No live challenges</T>
                <T v="caption">Join one, or start your own and invite friends.</T>
              </Card>
            </Press>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
