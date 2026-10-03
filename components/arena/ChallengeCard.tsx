import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { Countdown } from '@/components/ds/Countdown';
import { Sparkles } from '@/components/ds/Particles';
import { Card, Pill, Press, Row, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { ChallengeSummary } from '@/shared/contracts';
import { spring } from '@/theme/motion';
import { color, radius, space, type } from '@/theme/tokens';

export function statusPill(c: ChallengeSummary) {
  if (c.status === 'live') return <Pill label="Live" tone="volt" />;
  if (c.status === 'upcoming') return <Pill label="Starts soon" />;
  if (c.status === 'settling') return <Pill label="Verifying" />;
  return <Pill label="Finished" />;
}

function GoalBar({ steps, goal, tone }: { steps: number; goal: number; tone: string }) {
  const p = Math.min(1, goal ? steps / goal : 0);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: withSpring(p, spring.soft) }] }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { backgroundColor: tone }, fill]} />
    </View>
  );
}

/** Featured sponsored challenge: gold, sparkling, unmistakably the main event. */
export function FeaturedCard({ c }: { c: ChallengeSummary }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <Press onPress={() => router.push(`/challenge/${c.id}`)}>
      <View style={styles.featured} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <LinearGradient colors={['#2A2112', '#0E1013']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {size.w ? <Sparkles width={size.w} height={size.h} color={color.gold} /> : null}
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.sm}>
            {c.sponsor?.logoUrl ? <Image source={c.sponsor.logoUrl} style={styles.logo} contentFit="cover" /> : null}
            <T v="label" style={{ color: color.gold }}>Presented by {c.sponsor?.name}</T>
          </Row>
          {statusPill(c)}
        </Row>
        <T v="title" style={{ marginTop: space.lg }}>{c.name}</T>
        <T v="caption" style={{ marginTop: 4 }}>{c.sponsor?.prizeDescription}</T>
        <Row style={{ marginTop: space.xl, justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <T v="label">Prize pool</T>
            <T style={[type.num, { fontSize: 40, color: color.gold, letterSpacing: -1.5 }]}>GH₵{c.sponsor?.prizeValueGhs.toLocaleString()}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T v="label">Ends in</T>
            <Countdown to={c.status === 'upcoming' ? c.startsAt : c.endsAt} style={{ color: color.text, fontSize: 17 }} />
          </View>
        </Row>
        {c.me ? (
          <View style={{ marginTop: space.lg, gap: 6 }}>
            <GoalBar steps={c.me.steps} goal={c.me.goal} tone={color.gold} />
            <T v="caption">{c.me.steps.toLocaleString()} / {c.me.goal.toLocaleString()} your goal</T>
          </View>
        ) : (
          <Row style={{ marginTop: space.lg }}>
            <IconSymbol name="person.2.fill" size={14} color={color.muted} />
            <T v="caption">{c.players.toLocaleString()} walking · free entry</T>
          </Row>
        )}
      </View>
    </Press>
  );
}

export function ChallengeCard({ c }: { c: ChallengeSummary }) {
  const won = !!c.me?.goalHitAt;
  return (
    <Press onPress={() => router.push(`/challenge/${c.id}`)}>
      <Card tone={won ? 'gold' : undefined}>
        <Row style={{ justifyContent: 'space-between' }}>
          {statusPill(c)}
          <Row gap={6}>
            <IconSymbol name="clock.fill" size={12} color={color.muted} />
            <Countdown to={c.status === 'upcoming' ? c.startsAt : c.endsAt} style={{ color: color.muted, fontSize: 13 }} />
          </Row>
        </Row>
        <T v="heading" style={{ marginTop: space.md }}>{c.name}</T>
        <Row style={{ marginTop: space.md, justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <T v="label">Pool</T>
            <T style={[type.num, { fontSize: 24, color: color.gold }]}>{c.poolCredits.toLocaleString()} <T v="caption">cr</T></T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T v="label">Entry</T>
            <T style={[type.num, { fontSize: 18 }]}>{c.entryCredits ? `${c.entryCredits} cr` : 'Free'}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T v="label">Players</T>
            <T style={[type.num, { fontSize: 18 }]}>{c.players}</T>
          </View>
        </Row>
        {c.me ? (
          <View style={{ marginTop: space.md, gap: 6 }}>
            <GoalBar steps={c.me.steps} goal={c.me.goal} tone={won ? color.gold : color.volt} />
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="caption">#{c.me.rank} · {c.me.steps.toLocaleString()} steps</T>
              <T v="caption" style={{ color: won ? color.gold : color.muted }}>{won ? 'Goal hit' : `Goal ${c.me.goal.toLocaleString()}`}</T>
            </Row>
          </View>
        ) : null}
      </Card>
    </Press>
  );
}

const styles = StyleSheet.create({
  featured: {
    borderRadius: radius.xl,
    padding: space.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,195,106,0.35)',
  },
  logo: { width: 22, height: 22, borderRadius: 6 },
  track: { height: 6, borderRadius: 3, backgroundColor: color.raised, overflow: 'hidden' },
  fill: { height: '100%', width: '100%', borderRadius: 3, transformOrigin: 'left' },
});
