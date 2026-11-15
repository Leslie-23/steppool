import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { HourStrip } from '@/components/analytics/HourStrip';
import { TrendBars } from '@/components/analytics/TrendBars';
import { EmptyState, ErrorState } from '@/components/ds/EmptyState';
import { Odometer } from '@/components/ds/Odometer';
import { Skeleton } from '@/components/ds/Skeleton';
import { Card, Row, Screen, T } from '@/components/ds/primitives';
import { RecordCard } from '@/components/share/ShareCards';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { shareCard } from '@/lib/share';
import { useApi } from '@/lib/useApi';
import { BADGES } from '@/shared/engage';
import { color, space, type } from '@/theme/tokens';

type Icon = Parameters<typeof IconSymbol>[0]['name'];

export default function AnalyticsScreen() {
  const { data, refresh, loading, error } = useApi(api.analytics, [], 'analytics');
  const noSteps = !!data && data.activeDays === 0;
  const [pulling, setPulling] = useState(false);
  const [table, setTable] = useState(false);
  const name = useSession((s) => s.me?.name ?? '');
  const cardRef = useRef<View>(null);
  const records = data?.records;
  const earned = new Map((data?.badges ?? []).map((b) => [b.id, b.at]));
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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

        {loading ? (
          <View style={{ gap: space.xl }}>
            <View style={{ gap: 8 }}>
              <Skeleton w={80} h={10} />
              <Skeleton w={180} h={48} r={12} />
            </View>
            <Skeleton h={220} r={24} />
            <Row gap={space.md}>
              <Skeleton w="48%" h={96} r={20} />
              <Skeleton w="48%" h={96} r={20} />
            </Row>
          </View>
        ) : null}
        {error && !data ? <ErrorState onRetry={refresh} message={error.message} /> : null}
        {noSteps ? (
          <EmptyState
            icon="chart.line.uptrend.xyaxis"
            title="Your trends start here"
            body="Once StepPool has a few days of your steps, you'll see your 30-day trend, the hours you walk most and your streaks. Open the app after a walk to sync."
          />
        ) : null}

        {!data || noSteps ? null : (
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

            {records && (records.bestDay || records.longestStreak > 0) ? (
              <Animated.View entering={FadeInDown.delay(230).springify()} style={{ gap: space.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="label">All-time records</T>
                  {records.bestDay ? (
                    <Pressable onPress={() => shareCard(cardRef, `My best day on StepPool: ${records.bestDay!.steps.toLocaleString()} steps.`)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share your best day">
                      <Row gap={4}>
                        <IconSymbol name="square.and.arrow.up" size={13} color={color.gold} />
                        <T v="caption" style={{ color: color.gold }}>Share</T>
                      </Row>
                    </Pressable>
                  ) : null}
                </Row>
                <View style={styles.grid}>
                  <Tile icon="trophy.fill" label="Best day ever" value={records.bestDay ? records.bestDay.steps.toLocaleString() : '—'} sub={records.bestDay ? shortDate(records.bestDay.day) : undefined} gold />
                  <Tile icon="chart.bar.fill" label="Best week ever" value={records.bestWeek ? records.bestWeek.steps.toLocaleString() : '—'} sub={records.bestWeek ? `Week of ${shortDate(records.bestWeek.week)}` : 'After a full week'} gold />
                  <Tile icon="crown.fill" label="Longest streak ever" value={`${records.longestStreak}d`} sub="Days in a row on target" gold />
                </View>
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(245).springify()} style={{ gap: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="label">Badges</T>
                <T v="caption" style={{ fontSize: 12 }}>{earned.size} of {BADGES.length} earned</T>
              </Row>
              <View style={styles.grid}>
                {BADGES.map((b) => {
                  const at = earned.get(b.id);
                  return (
                    <Card key={b.id} tone={at ? 'gold' : undefined} style={[styles.tile, !at && { opacity: 0.55 }]}>
                      <IconSymbol name={(at ? b.icon : 'lock.fill') as Icon} size={18} color={at ? color.gold : color.faint} />
                      <T v="heading" style={{ fontSize: 15, marginTop: space.sm }}>{b.title}</T>
                      <T v="caption" style={{ fontSize: 11, marginTop: 2 }}>{at ? `Earned ${shortDate(at)}` : b.body}</T>
                    </Card>
                  );
                })}
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
      {records?.bestDay ? (
        <View style={styles.offscreen} pointerEvents="none">
          <RecordCard ref={cardRef} name={name} kicker="My best day" steps={records.bestDay.steps} when={shortDate(records.bestDay.day)} streak={records.longestStreak} />
        </View>
      ) : null}
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
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  tableRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
});
