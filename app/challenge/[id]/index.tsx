import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { LeaderRow } from '@/components/arena/LeaderRow';
import { CashRules } from '@/components/cash/CashRules';
import { ToastStack, useToasts } from '@/components/arena/Toast';
import { statusPill } from '@/components/arena/ChallengeCard';
import { Coin } from '@/components/ds/Coin';
import { Countdown } from '@/components/ds/Countdown';
import { HoldButton } from '@/components/ds/HoldButton';
import { Odometer } from '@/components/ds/Odometer';
import { Burst, Sparkles } from '@/components/ds/Particles';
import { StepRing } from '@/components/ds/StepRing';
import { Button, Card, Press, Row, Screen, T } from '@/components/ds/primitives';
import { InviteCard, ResultCard } from '@/components/share/ShareCards';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { inviteUrl } from '@/lib/invite';
import { payAndJoin } from '@/lib/pay';
import { useSession } from '@/lib/session';
import { shareCard } from '@/lib/share';
import { useChallengeRoom } from '@/lib/socket';
import { useApi } from '@/lib/useApi';
import type { LeaderboardRow } from '@/shared/contracts';
import { ghs } from '@/shared/cash';
import { challengeGoal, intensityLabel, stretchText } from '@/shared/goals';
import { color, space, type } from '@/theme/tokens';

const CONFETTI = [color.gold, color.volt, '#F4F1EA', '#FFB86B'];

export default function ArenaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width, height } = useWindowDimensions();
  const me = useSession((s) => s.me);
  const setMe = useSession((s) => s.setMe);
  const challenge = useApi(() => api.challenge(id), [id]);
  const board = useApi(() => api.leaderboard(id), [id]);
  const toasts = useToasts();
  const [burst, setBurst] = useState(0);
  const [poolSize, setPoolSize] = useState({ w: 0, h: 0 });
  const [joining, setJoining] = useState(false);
  const inviteRef = useRef<View>(null);
  const resultRef = useRef<View>(null);

  const c = challenge.data;
  const rows = board.data ?? [];
  const mine = rows.find((r) => r.userId === me?.id);
  const joined = !!c?.me;

  // Detect overtakes and my own goal hit by diffing consecutive leaderboards.
  const prev = useRef<{ rank?: number; goalHit?: boolean; rows: LeaderboardRow[] }>({ rows: [] });
  useEffect(() => {
    const p = prev.current;
    if (mine && p.rank !== undefined) {
      if (mine.rank < p.rank) {
        const passed = p.rows.find((r) => r.rank === mine.rank);
        haptic.overtake();
        toasts.push({ text: passed ? `You passed ${passed.name.split(' ')[0]} — now #${mine.rank}` : `Up to #${mine.rank}`, tone: 'volt', icon: 'arrow.up' });
      } else if (mine.rank > p.rank) {
        const by = rows.find((r) => r.rank === p.rank);
        haptic.overtake();
        toasts.push({ text: by ? `${by.name.split(' ')[0]} just passed you` : `Down to #${mine.rank}`, tone: 'muted', icon: 'arrow.down' });
      }
      if (mine.goalHit && !p.goalHit) {
        haptic.success();
        setBurst((b) => b + 1);
      }
    }
    prev.current = { rank: mine?.rank, goalHit: mine?.goalHit, rows };
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useChallengeRoom(id, {
    'leaderboard:delta': (p) => {
      if (p.challengeId !== id) return;
      board.mutate(p.rows);
      challenge.mutate((cur) => (cur ? { ...cur, poolCredits: p.pool, players: p.players } : cur));
    },
    'goal:hit': (p) => {
      if (p.challengeId !== id || p.userId === me?.id) return;
      toasts.push({ text: `${p.name.split(' ')[0]} hit their goal`, tone: 'gold', icon: 'checkmark.circle.fill' });
    },
    'challenge:settled': (p) => {
      if (p.challengeId === id) router.push(`/challenge/${id}/results`);
    },
  });

  const join = async () => {
    setJoining(true);
    try {
      const updated = c?.kind === 'cash' ? await payAndJoin(id) : await api.join(id);
      if (!updated) {
        toasts.push({ text: 'Payment not completed. You can try again.', tone: 'muted', icon: 'xmark' });
        return;
      }
      challenge.mutate(updated);
      haptic.success();
      setBurst((b) => b + 1);
      board.refresh();
      api.me().then(setMe).catch(() => {});
    } catch (e) {
      haptic.error();
      toasts.push({ text: (e as Error).message, tone: 'muted', icon: 'xmark' });
    } finally {
      setJoining(false);
    }
  };

  if (!c) return <Screen>{null}</Screen>;

  const sponsored = c.kind === 'sponsored';
  const isCash = c.kind === 'cash';
  const entryText = isCash ? `${ghs(c.entryPesewas ?? 0)} entry` : c.entryCredits ? `${c.entryCredits} credits entry` : 'Free entry';
  const accent = sponsored ? color.gold : color.volt;
  const durationH = (new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 3600_000;
  const previewGoal = challengeGoal(me?.baselineDaily ?? 0, durationH, c.goalMultiplier);
  const steps = mine?.steps ?? c.me?.steps ?? 0;
  const goal = c.me?.goal ?? previewGoal;
  const canAfford = isCash || (me?.credits ?? 0) >= c.entryCredits;
  const inviteText = `Join "${c.name}" on StepPool. ${entryText}. Hit your goal, share the pool. ${inviteUrl(c.inviteCode)}`;

  return (
    <Screen glow={accent}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80, gap: space.xl }} showsVerticalScrollIndicator={false}>
        <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <IconSymbol name="chevron.left" size={22} color={color.text} />
          </Pressable>
          <Row gap={space.lg}>
            <Pressable onPress={() => Share.share({ message: inviteText })} hitSlop={12}>
              <IconSymbol name="link" size={20} color={color.text} />
            </Pressable>
            <Pressable onPress={() => shareCard(inviteRef, inviteText)} hitSlop={12}>
              <IconSymbol name="square.and.arrow.up" size={20} color={color.text} />
            </Pressable>
          </Row>
        </Row>

        <Animated.View entering={FadeInDown.springify()} style={{ gap: space.sm }}>
          <Row>{statusPill(c)}{sponsored ? <T v="label" style={{ color: color.gold }}>  {c.sponsor?.name}</T> : null}</Row>
          <T v="title" style={{ fontSize: 34 }}>{c.name}</T>
          <Row gap={6}>
            <IconSymbol name="clock.fill" size={13} color={color.muted} />
            <T v="caption">{c.status === 'upcoming' ? 'Starts in ' : c.status === 'live' ? 'Ends in ' : ''}</T>
            <Countdown to={c.status === 'upcoming' ? c.startsAt : c.endsAt} style={{ color: color.text, fontSize: 14 }} />
            <View style={{ flex: 1 }} />
            {/* The code, readable aloud or from a screenshot; tap to share it. */}
            <Pressable onPress={() => Share.share({ message: inviteText })} style={styles.codeChip} accessibilityLabel={`Invite code ${c.inviteCode.split('').join(' ')}. Tap to share.`}>
              <T v="label" style={{ fontSize: 10 }}>Code</T>
              <T style={[type.num, { fontSize: 14, letterSpacing: 2 }]}>{c.inviteCode}</T>
            </Pressable>
          </Row>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <Card tone="gold" style={{ padding: space.xl }}>
            <View style={StyleSheet.absoluteFill} onLayout={(e) => setPoolSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
              {poolSize.w ? <Sparkles width={poolSize.w} height={poolSize.h} color={color.gold} count={14} /> : null}
            </View>
            <T v="label">{sponsored ? 'Prize' : 'Prize pool'}</T>
            {sponsored ? (
              <>
                <T style={[type.num, { fontSize: 48, color: color.gold, letterSpacing: -2 }]}>GH₵{c.sponsor?.prizeValueGhs.toLocaleString()}</T>
                <T v="caption">{c.sponsor?.prizeDescription}</T>
              </>
            ) : isCash ? (
              <T style={[type.num, { fontSize: 48, color: color.gold, letterSpacing: -2 }]}>{ghs(c.poolCredits)}</T>
            ) : (
              <Row gap={8} style={{ alignItems: 'center' }}>
                <Coin size={40} />
                <Odometer value={c.poolCredits} size={48} color={color.gold} />
              </Row>
            )}
            <T v="caption" style={{ marginTop: space.sm }}>
              {c.players} walking · {isCash ? 'redivided by who hits their goal' : 'split between everyone who hits their goal'}
            </T>
          </Card>
        </Animated.View>

        {joined ? (
          <Animated.View entering={ZoomIn.springify()} style={{ alignItems: 'center' }}>
            <StepRing progress={goal ? steps / goal : 0} size={220} stroke={14}>
              <T v="label">{mine?.goalHit ? 'Goal hit' : 'Your goal'}</T>
              <Odometer value={steps} size={38} color={mine?.goalHit ? color.gold : undefined} />
              <T v="caption">of {goal.toLocaleString()}</T>
            </StepRing>
            {mine?.goalHit ? (
              <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>
                <Button label="Share your result" tone="gold" onPress={() => shareCard(resultRef, `I hit my goal in "${c.name}" on StepPool. ${inviteUrl(c.inviteCode)}`)} />
              </View>
            ) : null}
          </Animated.View>
        ) : c.status === 'live' || c.status === 'upcoming' ? (
          <Animated.View entering={FadeIn} style={{ gap: space.md }}>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <View>
                  <T v="label">Your personal goal</T>
                  <T style={[type.num, { fontSize: 28 }]}>{previewGoal.toLocaleString()}</T>
                  <T v="caption">Your usual pace {stretchText(c.goalMultiplier)} · {intensityLabel(c.goalMultiplier)}</T>
                </View>
                <IconSymbol name="figure.walk" size={36} color={accent} />
              </Row>
            </Card>
            {isCash ? <CashRules entry={c.entryPesewas ?? 0} players={c.players + 1} /> : null}
            <HoldButton
              tone={sponsored || isCash ? 'gold' : 'volt'}
              label={joining ? 'Joining…' : isCash ? `Hold to pay ${ghs(c.entryPesewas ?? 0)} & join` : c.entryCredits ? `Hold to join · ${c.entryCredits} credits` : 'Hold to join · Free'}
              holdingLabel="Locking you in…"
              onConfirm={join}
              disabled={joining || !canAfford}
            />
            {!canAfford ? <T v="caption" style={{ textAlign: 'center', color: color.danger }}>You need {c.entryCredits - (me?.credits ?? 0)} more credits.</T> : null}
          </Animated.View>
        ) : null}

        <View style={{ gap: space.xs }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
            <T v="label">Leaderboard</T>
            {c.status === 'live' ? (
              <Row gap={6}>
                <View style={styles.liveDot} />
                <T v="caption" style={{ color: color.volt }}>Live</T>
              </Row>
            ) : null}
          </Row>
          {rows.length ? rows.map((r) => <LeaderRow key={r.userId} row={r} isMe={r.userId === me?.id} />) : <T v="caption">No one yet. Be first.</T>}
        </View>

        {c.status === 'settled' ? (
          <Press onPress={() => router.push(`/challenge/${id}/results`)}>
            <Card tone="gold">
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="heading">See results</T>
                <IconSymbol name="chevron.right" size={16} color={color.gold} />
              </Row>
            </Card>
          </Press>
        ) : null}
      </ScrollView>

      {/* Off-screen share cards, captured on demand. */}
      <View style={styles.offscreen} pointerEvents="none">
        <InviteCard ref={inviteRef} c={c} from={me?.name ?? 'A friend'} />
        <ResultCard ref={resultRef} c={c} name={me?.name ?? ''} steps={steps} rank={mine?.rank ?? 0} goalHit={!!mine?.goalHit} />
      </View>

      <Burst width={width} height={height} origin={{ x: width / 2, y: height * 0.42 }} colors={CONFETTI} play={burst} />
      <ToastStack items={toasts.items} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.volt },
  codeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: color.highlight, backgroundColor: color.surface },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
