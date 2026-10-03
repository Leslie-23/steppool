import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChallengeCard, FeaturedCard } from '@/components/arena/ChallengeCard';
import { Card, Press, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import type { ChallengeSummary } from '@/shared/contracts';
import { color, space } from '@/theme/tokens';

function Section({ title, items, offset = 0 }: { title: string; items: ChallengeSummary[]; offset?: number }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: space.md }}>
      <T v="label">{title}</T>
      {items.map((c, i) => (
        <Animated.View key={c.id} entering={FadeInDown.delay((offset + i) * 60).springify()}>
          <ChallengeCard c={c} />
        </Animated.View>
      ))}
    </View>
  );
}

export default function ChallengesScreen() {
  const { data, refresh } = useApi(api.challenges);
  const [pulling, setPulling] = useState(false);
  const mine = data?.mine.filter((c) => c.status !== 'settled') ?? [];
  const finished = data?.mine.filter((c) => c.status === 'settled') ?? [];

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
        <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
          <T v="title">Challenges</T>
          <Press onPress={() => router.push('/challenge/create')} style={{ backgroundColor: color.volt, borderRadius: 999, padding: 10 }}>
            <IconSymbol name="plus" size={20} color={color.bg} />
          </Press>
        </Row>

        {data?.featured.map((c, i) => (
          <Animated.View key={c.id} entering={FadeInDown.delay(i * 80).springify()}>
            <FeaturedCard c={c} />
          </Animated.View>
        ))}

        <Section title="You're in" items={mine} offset={1} />

        <Press onPress={() => router.push('/challenge/create')}>
          <Card style={{ borderStyle: 'dashed', borderWidth: 1, borderColor: color.faint }}>
            <Row gap={space.md}>
              <IconSymbol name="person.2.fill" size={22} color={color.volt} />
              <View style={{ flex: 1 }}>
                <T v="heading" style={{ fontSize: 16 }}>Start a private challenge</T>
                <T v="caption">Your class, your office, your group chat.</T>
              </View>
              <IconSymbol name="chevron.right" size={16} color={color.muted} />
            </Row>
          </Card>
        </Press>

        <Section title="Open to join" items={data?.open ?? []} offset={mine.length + 1} />
        <Section title="Finished" items={finished} />
      </ScrollView>
    </Screen>
  );
}
