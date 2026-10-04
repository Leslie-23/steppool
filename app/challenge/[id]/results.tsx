import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';

import { LeaderRow } from '@/components/arena/LeaderRow';
import { Coin, CoinAmount } from '@/components/ds/Coin';
import { Odometer } from '@/components/ds/Odometer';
import { Burst } from '@/components/ds/Particles';
import { Button, Card, Row, Screen, T } from '@/components/ds/primitives';
import { ResultCard } from '@/components/share/ShareCards';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { inviteUrl } from '@/lib/invite';
import { useSession } from '@/lib/session';
import { shareCard } from '@/lib/share';
import { useApi } from '@/lib/useApi';
import { ghs } from '@/shared/cash';
import { color, space, type } from '@/theme/tokens';

export default function Results() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const { data } = useApi(() => api.results(id), [id]);
  const [play, setPlay] = useState(0);
  const cardRef = useRef<View>(null);
  const r = data?.me;

  useEffect(() => {
    if (!r) return;
    if (r.goalHit) {
      haptic.success();
      setPlay(1);
    }
    api.me().then(setMe).catch(() => {});
  }, [r, setMe]);

  if (!data) return <Screen>{null}</Screen>;
  const c = data.challenge;
  const isCash = c.kind === 'cash';
  const won = r?.wonPesewas ? `${ghs(r.wonPesewas)} back` : r?.wonCredits ? `+${r.wonCredits} credits` : r?.prize;

  return (
    <Screen glow={r?.goalHit ? color.gold : color.volt}>
      <ScrollView contentContainerStyle={{ gap: space.xl, paddingBottom: space.xxxl, paddingTop: space.xxl }}>
        <Animated.View entering={FadeInUp.springify()} style={{ alignItems: 'center', gap: space.sm }}>
          <T v="label">{c.name}</T>
          <T v="title" style={{ fontSize: 40, textAlign: 'center' }}>{r?.goalHit ? 'You did it.' : r ? 'So close.' : 'Final results'}</T>
          {r ? (
            <T v="caption" style={{ textAlign: 'center' }}>
              {r.goalHit ? `${r.steps.toLocaleString()} of ${r.goal.toLocaleString()} steps — goal hit.` : `${r.steps.toLocaleString()} of ${r.goal.toLocaleString()} steps. Next one's yours.`}
            </T>
          ) : null}
        </Animated.View>

        {r ? (
          <Animated.View entering={ZoomIn.delay(200).springify()}>
            <Card tone={r.goalHit ? 'gold' : undefined} style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.sm }}>
              <T v="label">{isCash ? (r.goalHit ? 'You get back' : 'Returned to you') : r.goalHit ? 'You won' : 'Your rank'}</T>
              {isCash && r.wonPesewas != null ? (
                <>
                  <T style={[type.num, { fontSize: 56, color: r.goalHit ? color.gold : color.text, letterSpacing: -2 }]}>{ghs(r.wonPesewas)}</T>
                  <T v="caption">Entry {ghs(c.entryPesewas ?? 0)} · now in your wallet</T>
                </>
              ) : r.wonCredits ? (
                <Row gap={6} style={{ alignItems: 'flex-end' }}>
                  <Odometer value={r.wonCredits} size={64} color={color.gold} />
                  <T v="caption" style={{ marginBottom: 14 }}>credits</T>
                </Row>
              ) : r.prize ? (
                <T style={[type.num, { fontSize: 30, color: color.gold, textAlign: 'center' }]}>{r.prize}</T>
              ) : (
                <T style={[type.num, { fontSize: 64 }]}>#{r.rank}</T>
              )}
              {r.flagged ? <T v="caption" style={{ color: color.danger, textAlign: 'center' }}>Some of your steps didn't pass verification.</T> : null}
              {r.payoutId && r.prize ? <Button label="Claim prize" tone="gold" onPress={() => router.push(`/claim/${r.payoutId}`)} /> : null}
            </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <Row style={{ justifyContent: 'space-around' }}>
            <Stat label="Finishers" value={String(data.finishers)} />
            <Stat label="Players" value={String(c.players)} />
            {isCash && data.perFinisher ? (
              <View style={{ alignItems: 'center' }}>
                <T style={[type.num, { fontSize: 24, color: color.gold }]}>{ghs(data.perFinisher)}</T>
                <T v="label">Each finisher</T>
              </View>
            ) : data.perFinisher ? (
              <View style={{ alignItems: 'center' }}>
                <CoinAmount value={data.perFinisher} size={24} />
                <T v="label">Each got</T>
              </View>
            ) : null}
          </Row>
        </Animated.View>

        <View style={{ gap: space.xs }}>
          <T v="label" style={{ marginBottom: space.sm }}>Top walkers</T>
          {data.top.map((row) => (
            <LeaderRow key={row.userId} row={row} isMe={row.userId === me?.id} />
          ))}
        </View>

        <View style={{ gap: space.md }}>
          {r ? (
            <Button
              label="Share result"
              tone={r.goalHit ? 'gold' : 'volt'}
              onPress={() => shareCard(cardRef, `${r.goalHit ? 'Goal hit' : 'Finished'} in "${c.name}" on StepPool. ${inviteUrl(c.inviteCode)}`)}
            />
          ) : null}
          <Button label="Done" tone="ghost" onPress={() => router.back()} />
        </View>
      </ScrollView>

      <View style={styles.offscreen} pointerEvents="none">
        {r ? <ResultCard ref={cardRef} c={c} name={me?.name ?? ''} steps={r.steps} rank={r.rank} goalHit={r.goalHit} won={won} /> : null}
      </View>
      <Burst width={width} height={height} origin={{ x: width / 2, y: height * 0.3 }} colors={[color.gold, color.volt, '#F4F1EA']} count={180} play={play} />
    </Screen>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <T style={[type.num, { fontSize: 26, color: gold ? color.gold : color.text }]}>{value}</T>
      <T v="label">{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({ offscreen: { position: 'absolute', left: -10000, top: 0 } });
