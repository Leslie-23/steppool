import { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Avatar, Row, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { LeaderboardRow } from '@/shared/contracts';
import { spring } from '@/theme/motion';
import { color, radius, space, type } from '@/theme/tokens';

const MEDAL = ['#E8C36A', '#C9CDD3', '#C98B5A'];

/** One leaderboard line. Slides to its new slot on reorder and flashes when its steps change. */
export const LeaderRow = memo(function LeaderRow({ row, isMe }: { row: LeaderboardRow; isMe: boolean }) {
  const flash = useSharedValue(0);
  const prevSteps = useRef(row.steps);
  useEffect(() => {
    if (row.steps > prevSteps.current) flash.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 900 }));
    prevSteps.current = row.steps;
  }, [row.steps, flash]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.18 }));
  const progress = Math.min(1, row.goal ? row.steps / row.goal : 0);
  const medal = row.rank <= 3 ? MEDAL[row.rank - 1] : undefined;

  return (
    <Animated.View layout={LinearTransition.springify().damping(spring.soft.damping).stiffness(spring.soft.stiffness)} entering={FadeIn}>
      <View style={[styles.row, isMe && styles.me]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.volt, borderRadius: radius.md }, flashStyle]} pointerEvents="none" />
        <Row gap={space.md}>
          <T style={[type.num, styles.rank, medal ? { color: medal } : null]}>{row.rank}</T>
          <Avatar name={row.name} size={38} ring={row.goalHit ? color.gold : undefined} />
          <View style={{ flex: 1, gap: 6 }}>
            <Row gap={6}>
              <T v="heading" style={{ fontSize: 15 }} numberOfLines={1}>{isMe ? 'You' : row.name}</T>
              {row.goalHit ? <IconSymbol name="checkmark.circle.fill" size={14} color={color.gold} /> : null}
            </Row>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: row.goalHit ? color.gold : isMe ? color.volt : color.muted }]} />
            </View>
          </View>
          <T style={[type.num, { fontSize: 17 }]}>{row.steps.toLocaleString()}</T>
        </Row>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md, overflow: 'hidden' },
  me: { backgroundColor: color.voltDim, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(215,255,58,0.3)' },
  rank: { width: 26, fontSize: 17, color: color.muted, textAlign: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: color.raised, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
