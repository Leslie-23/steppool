import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { HourStrip } from '@/components/analytics/HourStrip';
import { TrendBars } from '@/components/analytics/TrendBars';
import { Odometer } from '@/components/ds/Odometer';
import { Card, Row, Screen, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useApi } from '@/lib/useApi';
import { color, space, type } from '@/theme/tokens';

type Icon = Parameters<typeof IconSymbol>[0]['name'];

export default function AnalyticsScreen() {
  const { data, refresh } = useApi(api.analytics);
  const [pulling, setPulling] = useState(false);
  const [table, setTable] = useState(false);

  const delta = data && data.lastWeek > 0 ? Math.round(((data.thisWeek - data.lastWeek) / data.lastWeek) * 100) : null;
  const avg = data && data.activeDays ? Math.round(data.days.reduce((a, d) => a + d.steps, 0) / data.activeDays) : 0;
  const finishRate = data && data.challenges.joined - data.challenges.live > 0 ? Math.round((data.challenges.finished / (data.challenges.joined - data.challenges.live)) * 100) : null;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxxl, gap: space.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            tintColor={color.volt}
            onRefresh={async () => {
              setPulling(true);
              await refresh();
              setPulling(false);
            }}
          />
        }
      >
        <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
            <IconSymbol name="chevron.left" size={22} color={color.text} />
          </Pressable>
          <T v="label">Last 30 days</T>
          <View style={{ width: 22 }} />
        </Row>
        <T v="title">Analytics</T>

        {!data ? null : (
          <>
            {/* Headline: a hero number, not a chart. */}
            <Animated.View entering={FadeInDown.springify()}>
              <T v="label">This week</T>
              <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
                <Odometer value={data.thisWeek} size={52} />
                {delta !== null ? (
                  <Row gap={4} style={[styles.delta, { backgroundColor: delta >= 0 ? color.voltDim : color.raised }]}>
                    <IconSymbol name={delta >= 0 ? 'arrow.up' : 'arrow.down'} size={12} color={delta >= 0 ? color.volt : color.muted} />
                    <T v="caption" style={{ color: delta >= 0 ? color.volt : color.muted, fontSize: 12 }}>
                      {Math.abs(delta)}% vs last week
                    </T>
                  </Row>
                ) : null}
              </Row>
              <T v="caption">Last week: {data.lastWeek.toLocaleString()} steps</T>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(80).springify()}>
              <Card>
                <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
                  <T v="label">Daily steps</T>
                  <T v="caption" style={{ fontSize: 12 }}>
                    {data.days.filter((d) => d.steps >= data.dailyTarget).length} of {data.days.length} days on target
                  </T>
                </Row>
                <TrendBars days={data.days} target={data.dailyTarget} />
                <Pressable
                  onPress={() => {
                    haptic.select();
                    setTable((t) => !t);
                  }}
                  style={{ marginTop: space.md }}
                  accessibilityRole="button"
                >
                  <T v="caption" style={{ color: color.volt }}>{table ? 'Hide data' : 'View as table'}</T>
                </Pressable>
                {table ? (
                  <Animated.View entering={FadeIn} style={{ marginTop: space.sm }}>
                    {[...data.days].reverse().map((d) => (
                      <Row key={d.day} style={styles.tableRow}>
                        <T v="caption" style={{ flex: 1 }}>{new Date(d.day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</T>
                        <T style={[type.num, { fontSize: 14 }]}>{d.steps.toLocaleString()}</T>
                        <View style={{ width: 22, alignItems: 'flex-end' }}>
                          {d.steps >= data.dailyTarget ? <IconSymbol name="checkmark.circle.fill" size={13} color={color.volt} /> : null}
                        </View>
                      </Row>
                    ))}
                  </Animated.View>
                ) : null}
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(140).springify()}>
              <Card>
                <T v="label" style={{ marginBottom: space.md }}>When you walk</T>
                <HourStrip hourlyUtc={data.hourly} />
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).springify()} style={{ gap: space.md }}>
              <T v="label">Your numbers</T>
              <View style={styles.grid}>
                <Tile icon="bolt.fill" label="Daily average" value={avg.toLocaleString()} />
                <Tile icon="trophy.fill" label="Best day" value={data.bestDay ? data.bestDay.steps.toLocaleString() : '—'} sub={data.bestDay ? new Date(data.bestDay.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : undefined} />
                <Tile icon="flame.fill" label="Current streak" value={`${data.streak}d`} accent={data.streak > 0} />
                <Tile icon="crown.fill" label="Longest streak" value={`${data.longestStreak}d`} />
                <Tile icon="figure.walk" label="Active days" value={`${data.activeDays}/30`} />
                <Tile icon="clock.fill" label="Usual day" value={data.baselineDaily.toLocaleString()} sub={`Target ${data.dailyTarget.toLocaleString()}`} />
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(260).springify()} style={{ gap: space.md }}>
              <T v="label">Challenges</T>
              <View style={styles.grid}>
                <Tile icon="person.2.fill" label="Joined" value={String(data.challenges.joined)} sub={data.challenges.live ? `${data.challenges.live} live` : undefined} />
                <Tile icon="checkmark.circle.fill" label="Goals hit" value={String(data.challenges.finished)} sub={finishRate !== null ? `${finishRate}% finish rate` : undefined} accent={data.challenges.finished > 0} />
                <Tile icon="wallet.pass.fill" label="Credits won" value={data.challenges.creditsWon.toLocaleString()} gold />
                <Tile icon="gift.fill" label="Prizes won" value={String(data.challenges.prizesWon)} gold />
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Tile({ icon, label, value, sub, accent, gold }: { icon: Icon; label: string; value: string; sub?: string; accent?: boolean; gold?: boolean }) {
  // The icon carries the accent; numbers stay in text ink.
  const tint = gold ? color.gold : accent ? color.volt : color.muted;
  return (
    <Card style={styles.tile}>
      <IconSymbol name={icon} size={16} color={tint} />
      <T style={[type.num, { fontSize: 24, marginTop: space.sm }]}>{value}</T>
      <T v="label" style={{ fontSize: 10 }}>{label}</T>
      {sub ? <T v="caption" style={{ fontSize: 11, marginTop: 2 }}>{sub}</T> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  delta: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { width: '47.5%', flexGrow: 1, paddingVertical: space.md },
  tableRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
});
