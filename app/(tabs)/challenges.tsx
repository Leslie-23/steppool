import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { ChallengeCard, FeaturedCard } from '@/components/arena/ChallengeCard';
import { EmptyState, ErrorState } from '@/components/ds/EmptyState';
import { Reveal } from '@/components/ds/Reveal';
import { ChallengeCardSkeleton, Skeleton } from '@/components/ds/Skeleton';
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
        <Reveal key={c.id} index={offset + i}>
          <ChallengeCard c={c} />
        </Reveal>
      ))}
    </View>
  );
}

export default function ChallengesScreen() {
  const { data, refresh, loading, error } = useApi(api.challenges, [], 'challenges');
  const nothingToJoin = !!data && !data.featured.length && !data.open.length;
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

        {loading ? (
          <View style={{ gap: space.md }}>
            <Skeleton h={190} r={24} />
            <ChallengeCardSkeleton />
          </View>
        ) : error && !data ? (
          <ErrorState onRetry={refresh} message={error.message} />
        ) : null}

        {data?.featured.map((c, i) => (
          <Reveal key={c.id} index={i}>
            <FeaturedCard c={c} />
          </Reveal>
        ))}

        <Press onPress={() => router.push('/code')} accessibilityRole="button" accessibilityLabel="Have a code? Join a friend's challenge">
          <Card tone="volt">
            <Row gap={space.md}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color.voltDim, alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="ticket.fill" size={20} color={color.volt} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="heading" style={{ fontSize: 16 }}>Have a code?</T>
                <T v="caption">Join a friend's challenge with its 6-character code.</T>
              </View>
              <IconSymbol name="chevron.right" size={16} color={color.muted} />
            </Row>
          </Card>
        </Press>

        <Section title="You're in" items={mine} offset={1} />

        {nothingToJoin && !mine.length ? (
          <EmptyState
            icon="flag.checkered"
            title="No open challenges right now"
            body="Most challenges are private: friends join with a code. Be the one who starts it."
            primary={{ label: 'Start a challenge', onPress: () => router.push('/challenge/create') }}
          />
        ) : (
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
        )}

        <Section title="Open to join" items={data?.open ?? []} offset={mine.length + 1} />
        <Section title="Finished" items={finished} />
      </ScrollView>
    </Screen>
  );
}
